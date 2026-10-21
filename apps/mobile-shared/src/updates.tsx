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
 *   4. native Alert → download with progress → Android installer.
 *
 * The installer always shows its own confirmation. Silent installation needs
 * device-owner privileges, which a normally installed app does not have.
 *
 * The first build that contains this module (1.0.4) must be installed by hand;
 * every release after that can arrive through this screen.
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
  Alert,
  AppState,
  DeviceEventEmitter,
  Modal,
  NativeModules,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { APP_FLAVOR, APP_NAME, APP_VERSION } from '../config';
import { ProgressBar } from './components';
import { colors, font, radius, shadow, space } from './theme';

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
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('<!--'))
    .slice(0, 4);
  if (!lines.length) return '';
  const text = lines.join('\n');
  return text.length > 400 ? `${text.slice(0, 397)}…` : text;
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
      Alert.alert(
        'Allow updates from SalonPro',
        `Android needs your permission before ${APP_NAME} can open the installer.\n\nTurn on “Allow from this source”, then come back — the download starts automatically.`,
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => {
              pendingPermission.current = null;
            },
          },
          {
            text: 'Open settings',
            onPress: () => {
              void native.openInstallPermissionSettings().catch(() => {
                Alert.alert(
                  'Open Settings yourself',
                  'Go to Settings → Apps → SalonPro → Install unknown apps and allow it.',
                );
              });
            },
          },
        ],
      );
      return;
    }

    setUpdate(target);
    setProgress({ percent: 0, received: 0, total: target.size });
    setDownloading(true);
    try {
      // The promise resolves once Android's installer is on screen.
      await native.downloadAndInstall(target.downloadUrl, target.assetName, target.digest);
    } catch (error) {
      Alert.alert(
        'Update did not install',
        error instanceof Error ? error.message : 'The update could not be installed. Please try again.',
      );
    } finally {
      if (alive.current) setDownloading(false);
    }
  }, []);

  const check = useCallback(async (options?: { manual?: boolean }) => {
    const manual = options?.manual ?? false;

    if (!native) {
      if (manual) {
        Alert.alert(
          'Updates unavailable in this build',
          'This APK predates in-app updates. Install the latest build from the GitHub release once; every release after that installs from inside the app.',
        );
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
          Alert.alert('No update published', `There is no newer ${APP_NAME} build on GitHub yet.`);
        }
        return;
      }

      if (!isNewer(latest.version, versionRef.current)) {
        setUpdate(null);
        if (manual) {
          Alert.alert('You’re up to date', `${APP_NAME} ${versionRef.current} is the newest published version.`);
        }
        return;
      }

      setUpdate(latest);
      if (!manual && promptedVersion.current === latest.version) return;
      promptedVersion.current = latest.version;

      const notes = shortNotes(latest.notes);
      const size = latest.size > 0 ? ` Download size: ${formatBytes(latest.size)}.` : '';
      Alert.alert(
        'Update available',
        `${APP_NAME} ${latest.version} is ready — you have ${versionRef.current}.${size}` +
          (notes ? `\n\nWhat’s new:\n${notes}` : '') +
          '\n\nDownload it now? Android’s installer opens when it is ready.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Update now', onPress: () => void install(latest) },
        ],
      );
    } catch (error) {
      if (manual) {
        Alert.alert(
          'Could not check for updates',
          error instanceof Error ? error.message : 'Try again in a moment.',
        );
      }
    } finally {
      checkInFlight.current = false;
      if (manual && alive.current) setChecking(false);
    }
  }, [install]);

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
              Alert.alert(
                'Permission still off',
                'Turn on “Allow from this source” for SalonPro, then tap “Check for updates” again.',
              );
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
      <Modal
        visible={downloading}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.kicker}>SALONPRO UPDATE</Text>
            <Text style={styles.title}>
              {update ? `Downloading ${update.version}` : 'Downloading update'}
            </Text>
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
              Keep the app open. Android’s installer opens when the download finishes — tap
              “Update” there to finish.
            </Text>
          </View>
        </View>
      </Modal>
    </UpdateContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#170B1FB8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space(5),
    gap: space(2),
    ...shadow.raised,
  },
  kicker: {
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy,
    letterSpacing: 1.4,
    color: colors.brand600,
  },
  title: {
    fontSize: font.size.lg,
    fontWeight: font.weight.heavy,
    color: colors.ink900,
    letterSpacing: -0.3,
  },
  size: { fontSize: font.size.sm, color: colors.ink500 },
  progressBlock: { marginTop: space(2), gap: space(2) },
  percent: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.brand700, textAlign: 'right' },
  spinner: { marginVertical: space(4) },
  hint: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(2) },
});
