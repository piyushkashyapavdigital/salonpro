/**
 * In-app APK updates.
 *
 * The apps are sideloaded, so Google Play's in-app update API is not available.
 * This does what the browser flow did — fetch the release APK, hand it to
 * Android's package installer — without the trip to GitHub:
 *
 *   1. ask GitHub for the newest published releases;
 *   2. pick the asset for this app (`mobile-customer-…` / `mobile-admin-…`);
 *   3. compare its version with the installed `versionName`;
 *   4. show a SalonPro sheet → download with progress → Android installer.
 *
 * The installer always shows its own confirmation. Silent installation needs
 * device-owner privileges, which a normally installed app does not have. The
 * app-owned prompt, notes, permission explanation and progress are all custom.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  DeviceEventEmitter,
  Modal,
  NativeModules,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { APP_FLAVOR, APP_NAME, APP_VERSION } from '../config';
import { BrandMark, Button, ProgressBar } from './components';
import { colors, font, motion, radius, shadow, space } from './theme';

const REPO = 'piyushkashyapavdigital/salonpro';
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=10`;

/** How long an automatic check stays quiet before it may run again. */
const AUTO_CHECK_INTERVAL_MS = 10 * 60 * 1000;

type ApkUpdaterNative = {
  getVersionCode(): Promise<number>;
  getVersionName(): Promise<string>;
  canInstallPackages(): Promise<boolean>;
  openInstallPermissionSettings(): Promise<boolean>;
  downloadAndInstall(url: string, fileName: string, expectedSha256: string | null): Promise<string>;
};

const native: ApkUpdaterNative | undefined = NativeModules.ApkUpdater;

export type UpdateInfo = {
  version: string;
  assetName: string;
  downloadUrl: string;
  size: number;
  digest: string | null;
  notes: string;
  releaseUrl: string;
};

type DownloadProgress = { percent: number; received: number; total: number };

type DialogAction = {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  onPress?: () => void;
};

type DialogState = {
  tone: 'update' | 'permission' | 'info' | 'error';
  kicker: string;
  title: string;
  message: string;
  notes?: string;
  primary: DialogAction;
  secondary?: DialogAction;
};

type UpdateContextValue = {
  /** The installed build's versionName, read from Android (falls back to config). */
  currentVersion: string;
  checking: boolean;
  downloading: boolean;
  progress: DownloadProgress;
  update: UpdateInfo | null;
  /** Check now. `manual` shows an answer even when there is nothing new. */
  check: (options?: { manual?: boolean }) => Promise<void>;
  install: (update: UpdateInfo) => Promise<void>;
};

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function useAppUpdate(): UpdateContextValue {
  const value = useContext(UpdateContext);
  if (!value) throw new Error('useAppUpdate must be used inside <UpdateProvider>');
  return value;
}

/* ------------------------------------------------------------------ */
/* GitHub                                                              */
/* ------------------------------------------------------------------ */

type GithubAsset = {
  name: string;
  size?: number;
  browser_download_url: string;
  digest?: string | null;
};

type GithubRelease = {
  tag_name?: string;
  name?: string;
  body?: string | null;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  created_at?: string | null;
  assets?: GithubAsset[];
};

function assetPrefix(): string {
  return APP_FLAVOR === 'admin' ? 'mobile-admin-' : 'mobile-customer-';
}

async function fetchLatest(): Promise<UpdateInfo | null> {
  const response = await fetch(RELEASES_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'SalonPro-Android',
    },
  });

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error('GitHub is rate-limiting update checks right now. Try again in a little while.');
    }
    throw new Error(`GitHub answered with HTTP ${response.status}.`);
  }

  const raw = (await response.json()) as GithubRelease[];
  if (!Array.isArray(raw)) return null;

  const prefix = assetPrefix();
  const releases = raw
    .filter((release) => !release.draft && !release.prerelease)
    .sort(
      (a, b) =>
        Date.parse(b.published_at ?? b.created_at ?? '') - Date.parse(a.published_at ?? a.created_at ?? ''),
    );

  for (const release of releases) {
    const asset = (release.assets ?? []).find(
      (candidate) =>
        candidate.name.startsWith(prefix) && candidate.name.toLowerCase().endsWith('.apk'),
    );
    if (!asset) continue;

    const version = asset.name.slice(prefix.length, -4);
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;

    return {
      version,
      assetName: asset.name,
      downloadUrl: asset.browser_download_url,
      size: asset.size ?? 0,
      digest: asset.digest ?? null,
      notes: (release.body ?? '').trim(),
      releaseUrl: release.html_url ?? '',
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Versions                                                            */
/* ------------------------------------------------------------------ */

function parts(version: string): number[] {
  return version
    .split(/[.\-+]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Numeric semver comparison — enough for `1.0.10 > 1.0.9`. */
function isNewer(candidate: string, installed: string): boolean {
  const next = parts(candidate);
  const current = parts(installed);
  for (let index = 0; index < 3; index += 1) {
    if ((next[index] ?? 0) > (current[index] ?? 0)) return true;
    if ((next[index] ?? 0) < (current[index] ?? 0)) return false;
  }
  return false;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortNotes(notes: string): string {
  if (!notes) return '';
  const lines = notes
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s+/, '• '))
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('<!--'))
    .slice(0, 5);
  if (!lines.length) return '';
  const text = lines.join('\n');
  return text.length > 480 ? `${text.slice(0, 477)}…` : text;
}

/* ------------------------------------------------------------------ */
/* Custom modal                                                        */
/* ------------------------------------------------------------------ */

function SheetModal({
  visible,
  children,
  onRequestClose,
}: {
  visible: boolean;
  children: React.ReactNode;
  onRequestClose?: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    enter.setValue(0);
    Animated.spring(enter, {
      toValue: 1,
      useNativeDriver: true,
      ...motion.spring,
    }).start();
  }, [enter, visible]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onRequestClose}>
      <Animated.View style={[styles.backdrop, { opacity: enter }]}>
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) },
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
              ],
            },
          ]}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function DialogView({ dialog, onClose }: { dialog: DialogState; onClose: () => void }) {
  const run = (action: DialogAction) => {
    onClose();
    action.onPress?.();
  };

  return (
    <>
      <View style={styles.dialogHead}>
        <BrandMark size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{dialog.kicker}</Text>
          <Text style={styles.dialogTitle}>{dialog.title}</Text>
        </View>
      </View>
      <Text style={styles.dialogMessage}>{dialog.message}</Text>
      {dialog.notes ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>WHAT’S NEW</Text>
          <Text style={styles.notesText}>{dialog.notes}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {dialog.secondary ? (
          <Button
            label={dialog.secondary.label}
            variant="secondary"
            onPress={() => run(dialog.secondary!)}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button
          label={dialog.primary.label}
          variant={dialog.primary.variant ?? 'primary'}
          onPress={() => run(dialog.primary)}
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [currentVersion, setCurrentVersion] = useState(APP_VERSION);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress>({ percent: 0, received: 0, total: 0 });
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const versionRef = useRef(currentVersion);
  const promptedVersion = useRef<string | null>(null);
  const pendingPermission = useRef<UpdateInfo | null>(null);
  const checkInFlight = useRef(false);
  const lastCheck = useRef(0);
  const downloadingRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    versionRef.current = currentVersion;
  }, [currentVersion]);

  useEffect(() => {
    downloadingRef.current = downloading;
  }, [downloading]);

  /* The installed versionName is authoritative; config.ts is only a fallback. */
  useEffect(() => {
    if (!native) return;
    native
      .getVersionName()
      .then((version) => {
        if (alive.current && version && version !== versionRef.current) {
          setCurrentVersion(version);
        }
      })
      .catch(() => {});
  }, []);

  const install = useCallback(async (target: UpdateInfo) => {
    if (!native || downloadingRef.current) return;

    const allowed = await native.canInstallPackages().catch(() => false);
    if (!allowed) {
      pendingPermission.current = target;
      setDialog({
        tone: 'permission',
        kicker: 'ONE-TIME ANDROID PERMISSION',
        title: 'Allow updates from SalonPro',
        message:
          `Android needs your permission before ${APP_NAME} can open the installer. ` +
          'Tap “Open settings”, turn on “Allow from this source”, then come back — the download starts automatically.',
        primary: {
          label: 'Open settings',
          onPress: () => {
            void native.openInstallPermissionSettings().catch(() => {
              setDialog({
                tone: 'info',
                kicker: 'OPEN SETTINGS MANUALLY',
                title: 'One small step',
                message: 'Go to Settings → Apps → SalonPro → Install unknown apps and allow it, then return here.',
                primary: { label: 'Got it' },
              });
            });
          },
        },
        secondary: {
          label: 'Not now',
          onPress: () => {
            pendingPermission.current = null;
          },
        },
      });
      return;
    }

    setUpdate(target);
    setDialog(null);
    setProgress({ percent: 0, received: 0, total: target.size });
    setDownloading(true);
    try {
      // The promise resolves once Android's installer is on screen.
      await native.downloadAndInstall(target.downloadUrl, target.assetName, target.digest);
    } catch (error) {
      setDialog({
        tone: 'error',
        kicker: 'UPDATE INTERRUPTED',
        title: 'The update did not install',
        message: error instanceof Error ? error.message : 'The update could not be installed. Please try again.',
        primary: { label: 'Try again', onPress: () => void install(target) },
        secondary: { label: 'Close' },
      });
    } finally {
      if (alive.current) setDownloading(false);
    }
  }, []);

  const check = useCallback(
    async (options?: { manual?: boolean }) => {
      const manual = options?.manual ?? false;

      if (!native) {
        if (manual) {
          setDialog({
            tone: 'info',
            kicker: 'UPDATES UNAVAILABLE',
            title: 'This build predates in-app updates',
            message:
              'Install the latest APK from the GitHub release once. Every release after that can be installed from inside SalonPro.',
            primary: { label: 'Got it' },
          });
        }
        return;
      }
      if (checkInFlight.current || downloadingRef.current) return;

      checkInFlight.current = true;
      if (manual) setChecking(true);
      try {
        const latest = await fetchLatest();
        lastCheck.current = Date.now();

        if (!latest) {
          if (manual) {
            setDialog({
              tone: 'info',
              kicker: 'NO RELEASE YET',
              title: 'No update published',
              message: `There is no newer ${APP_NAME} build on GitHub yet.`,
              primary: { label: 'Got it' },
            });
          }
          return;
        }

        if (!isNewer(latest.version, versionRef.current)) {
          setUpdate(null);
          if (manual) {
            setDialog({
              tone: 'info',
              kicker: 'ALL CAUGHT UP',
              title: 'You’re up to date',
              message: `${APP_NAME} ${versionRef.current} is the newest published version.`,
              primary: { label: 'Nice' },
            });
          }
          return;
        }

        setUpdate(latest);
        if (!manual && promptedVersion.current === latest.version) return;
        promptedVersion.current = latest.version;

        const notes = shortNotes(latest.notes);
        const size = latest.size > 0 ? ` Download size: ${formatBytes(latest.size)}.` : '';
        setDialog({
          tone: 'update',
          kicker: 'NEW BUILD AVAILABLE',
          title: `${APP_NAME} ${latest.version} is ready`,
          message: `You are on ${versionRef.current}.${size} Android’s installer opens when the download is ready.`,
          notes: notes || undefined,
          primary: { label: 'Update now', onPress: () => void install(latest) },
          secondary: { label: 'Later' },
        });
      } catch (error) {
        if (manual) {
          setDialog({
            tone: 'error',
            kicker: 'UPDATE CHECK FAILED',
            title: 'Could not check for updates',
            message: error instanceof Error ? error.message : 'Try again in a moment.',
            primary: { label: 'Try again', onPress: () => void check({ manual: true }) },
            secondary: { label: 'Close' },
          });
        }
      } finally {
        checkInFlight.current = false;
        if (manual && alive.current) setChecking(false);
      }
    },
    [install],
  );

  /* Download progress comes from the native module. */
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'ApkUpdaterProgress',
      (event: Partial<DownloadProgress>) => {
        if (!alive.current) return;
        setProgress({
          percent: typeof event.percent === 'number' ? event.percent : 0,
          received: typeof event.received === 'number' ? event.received : 0,
          total: typeof event.total === 'number' ? event.total : 0,
        });
      },
    );
    return () => subscription.remove();
  }, []);

  /*
   * One automatic check per launch. A resume re-checks at most every 10 minutes,
   * and also finishes a download the user started by granting the install
   * permission in Settings.
   */
  useEffect(() => {
    if (!native) return;

    const timer = setTimeout(() => {
      void check();
    }, 2500);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;

      const pending = pendingPermission.current;
      if (pending) {
        pendingPermission.current = null;
        void native
          .canInstallPackages()
          .then((allowed) => {
            if (allowed) {
              void install(pending);
            } else {
              setDialog({
                tone: 'permission',
                kicker: 'PERMISSION STILL OFF',
                title: 'One more try',
                message:
                  'Turn on “Allow from this source” for SalonPro, then tap “Check for updates” again. Android will not let the app install without it.',
                primary: { label: 'Got it' },
              });
            }
          })
          .catch(() => {});
        return;
      }

      if (!downloadingRef.current && Date.now() - lastCheck.current > AUTO_CHECK_INTERVAL_MS) {
        void check();
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [check, install]);

  const value = useMemo<UpdateContextValue>(
    () => ({ currentVersion, checking, downloading, progress, update, check, install }),
    [currentVersion, checking, downloading, progress, update, check, install],
  );

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <SheetModal visible={Boolean(dialog)} onRequestClose={() => setDialog(null)}>
        {dialog ? <DialogView dialog={dialog} onClose={() => setDialog(null)} /> : null}
      </SheetModal>

      <SheetModal visible={downloading}>
        <View style={styles.progressHead}>
          <BrandMark size={44} />
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>SALONPRO UPDATE</Text>
            <Text style={styles.progressTitle}>
              {update ? `Downloading ${update.version}` : 'Downloading update'}
            </Text>
          </View>
        </View>
        <Text style={styles.size}>
          {formatBytes(progress.received)}
          {progress.total > 0 ? ` of ${formatBytes(progress.total)}` : ''}
        </Text>

        {progress.total > 0 ? (
          <View style={styles.progressBlock}>
            <ProgressBar ratio={progress.percent / 100} />
            <Text style={styles.percent}>{Math.round(progress.percent)}%</Text>
          </View>
        ) : (
          <ActivityIndicator color={colors.brand500} style={styles.spinner} />
        )}

        <Text style={styles.hint}>
          Keep the app open. Android’s installer opens when the download finishes — tap “Update” there to finish.
        </Text>
      </SheetModal>
    </UpdateContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 59, 52, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(5),
  },
  sheet: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space(5),
    gap: space(3),
    ...shadow.raised,
  },
  dialogHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  kicker: {
    fontSize: 10,
    fontWeight: font.weight.heavy,
    letterSpacing: 1.5,
    color: colors.brand600,
  },
  dialogTitle: {
    marginTop: 3,
    fontFamily: font.family.display,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    color: colors.ink900,
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  dialogMessage: { fontSize: font.size.sm, color: colors.ink600, lineHeight: 21 },
  notesBox: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.ink100,
    borderRadius: radius.md,
    padding: space(3.5),
    gap: space(1.5),
  },
  notesLabel: {
    fontSize: 9,
    fontWeight: font.weight.heavy,
    letterSpacing: 1.2,
    color: colors.ink400,
  },
  notesText: { fontSize: font.size.sm, color: colors.ink700, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: space(2), marginTop: space(1) },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  progressTitle: {
    marginTop: 3,
    fontFamily: font.family.display,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    color: colors.ink900,
    letterSpacing: -0.3,
  },
  size: { fontSize: font.size.sm, color: colors.ink500 },
  progressBlock: { marginTop: space(2), gap: space(2) },
  percent: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.brand700, textAlign: 'right' },
  spinner: { marginVertical: space(4) },
  hint: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(2) },
});
