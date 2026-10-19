import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ROLE_LABEL, type Role } from '@salonpro/shared';
import { useAuth } from '../lib/auth';
import { homePath, isAdminApp } from '../lib/mode';
import { ApiError, buildApiBase, endpoints, getApiBase } from '../lib/api';
import { isNative } from '../lib/native';
import { Logo } from '../components/layout';
import { Alert, Avatar, Button, Card, Field, Input } from '../components/ui';
import { ServerCard } from '../components/ServerCard';
import { IconArrowLeft, IconLock, IconPhone, IconShield } from '../components/icons';
import { useToast } from '../components/Toast';

type Step = 'phone' | 'otp';

export default function Login() {
  const { signIn, signInWithSession, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const staffMode = isAdminApp || params.get('mode') === 'staff';

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<{ accounts: { name: string; phone: string; role: string }[]; password: string } | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    endpoints
      .demoAccounts()
      .then((data) => setDemo({ accounts: data.accounts, password: data.password }))
      .catch(() => setDemo(null));
  }, []);

  useEffect(() => {
    if (user) navigate(homePath(user.role), { replace: true });
  }, [user, navigate]);

  /* The server *answering* with an error and the server being *unreachable* are
   * different problems, and only the second one the person can fix themselves —
   * by pointing the app at the right address (the Server card sits right below
   * the form in the packaged apps). Say which one happened. */
  const describeError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError) return err.message;
    if (isNative()) {
      return `${fallback} The server at ${getApiBase() || 'the built-in address'} could not be reached — check the Server address below.`;
    }
    return `${fallback} Check your connection and try again.`;
  };

  const requestOtp = async () => {
    setError(null);
    if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
      setError('Enter a 10 digit mobile number.');
      return;
    }
    setBusy(true);
    try {
      const result = await endpoints.requestOtp(phone.replace(/\D/g, ''));
      setDevCode(result.devCode ?? null);
      setNotice(result.notice);
      setIsNewUser(result.isNewUser);
      setStep('otp');
      toast.info(
        result.deliveryMode === 'development_mock' ? 'OTP generated in DEV MODE' : 'OTP sent',
        result.deliveryMode === 'development_mock'
          ? 'No SMS provider is configured, so the code is shown on screen and logged on the server.'
          : 'Check your messages for the 6 digit code.',
      );
    } catch (err) {
      setError(describeError(err, 'Could not send a one-time code.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const referralToken = localStorage.getItem('salonpro.referralToken') ?? undefined;
      const session = await endpoints.verifyOtp({
        phone: phone.replace(/\D/g, ''),
        code: code.trim(),
        name: isNewUser && name.trim() ? name.trim() : undefined,
        referralToken,
      });
      localStorage.removeItem('salonpro.referralToken');
      signInWithSession({ token: session.token ?? '', user: session.user, wallet: session.wallet });
      toast.success(`Welcome back, ${session.user.name.split(' ')[0]}!`);
      navigate(homePath(session.user.role), { replace: true });
    } catch (err) {
      setError(describeError(err, 'Could not verify that code.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: brand panel */}
      <div className="relative hidden bg-ink-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="grid-lines absolute inset-0 opacity-70" />
        <div className="relative">
          <Logo dark />
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-[34px] leading-tight">
            {isAdminApp ? 'Run your salon from one dashboard.' : 'Your Salon. Your Style. Your Rewards.'}
          </h1>
          <p className="mt-4 text-[14.5px] leading-relaxed text-ink-200">
            {isAdminApp
              ? 'Appointments, customers, wallet, referrals and revenue reporting for owners, managers, receptionists and stylists — every action scoped to your role.'
              : 'One account for booking, your prepaid wallet and referral rewards. Phone verification keeps your history, wallet and personal details private to you.'}
          </p>
          <ul className="mt-8 space-y-3 text-[13.5px] text-ink-200">
            {(isAdminApp
              ? [
                  'Role-scoped staff sign in',
                  'Server-enforced permissions',
                  'Append-only wallet ledger',
                  'Live revenue & retention reports',
                ]
              : [
                  'Verified phone OTP sign in',
                  'Server-enforced role permissions',
                  'Append-only wallet ledger',
                  'Reminders only when you consent',
                ]
            ).map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/30 text-[11px] font-semibold text-white">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-ink-400">
          Payments run in Razorpay test mode until live keys are configured.
        </p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center bg-ink-50 px-5 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Logo />
            {!isAdminApp ? (
              <Link to="/" className="btn-quiet btn-sm">
                <IconArrowLeft size={15} /> Home
              </Link>
            ) : null}
          </div>

          {!isAdminApp ? (
            <div className="mb-6 hidden lg:block">
              <Link to="/" className="btn-quiet btn-sm -ml-2">
                <IconArrowLeft size={15} /> Back to home
              </Link>
            </div>
          ) : null}

          <Card className="p-6">
            {step === 'phone' ? (
              <>
                <h2 className="text-[21px] font-semibold">{staffMode ? 'Salon staff sign in' : 'Sign in or create your account'}</h2>
                <p className="mt-1.5 text-[13.5px] text-ink-400">
                  {staffMode
                    ? 'Owners, managers, receptionists and stylists sign in with the mobile number the salon invited.'
                    : 'We will send a one-time code to verify your mobile number.'}
                </p>

                <div className="mt-6 space-y-4">
                  <Field label="Mobile number" hint="Indian mobile number, 10 digits.">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-ink-400">
                        +91
                      </span>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        onKeyDown={(e) => e.key === 'Enter' && requestOtp()}
                        placeholder="98XX XX XX XX"
                        inputMode="numeric"
                        autoComplete="tel"
                        className="pl-14 tracking-wide"
                      />
                    </div>
                  </Field>

                  {error ? <Alert tone="danger">{error}</Alert> : null}

                  <Button variant="brand" size="lg" className="w-full" loading={busy} onClick={requestOtp}>
                    <IconPhone size={17} /> Send one-time code
                  </Button>

                  <p className="flex items-start gap-2 text-[12px] leading-snug text-ink-400">
                    <IconShield size={15} className="mt-[1px] shrink-0" />
                    We only store your name, phone and visit history. Consent, data export and account deletion are in
                    your profile.
                  </p>
                </div>
              </>
            ) : (
              <>
                <button className="btn-quiet btn-sm -ml-2 mb-4" onClick={() => setStep('phone')}>
                  <IconArrowLeft size={15} /> Change number
                </button>
                <h2 className="text-[21px] font-semibold">Enter the 6 digit code</h2>
                <p className="mt-1.5 text-[13.5px] text-ink-400">
                  Sent to <span className="font-medium text-ink-700">+91 {phone}</span>
                </p>

                {devCode ? (
                  <div className="mt-4 rounded-xl border border-brand-300/70 bg-brand-100 px-3.5 py-3">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-700">DEV MODE</p>
                    <p className="mt-1 text-[13px] leading-snug text-brand-700">{notice}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="font-display text-[26px] tracking-[0.32em] text-ink-900">{devCode}</span>
                      <button className="btn-ghost btn-sm" onClick={() => setCode(devCode)}>
                        Use this code
                      </button>
                    </div>
                  </div>
                ) : (
                  <Alert tone="info" className="mt-4">
                    {notice ?? 'Enter the code we sent to your mobile.'}
                  </Alert>
                )}

                <div className="mt-5 space-y-4">
                  <Field label="One-time code">
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={(e) => e.key === 'Enter' && verify()}
                      placeholder="••••••"
                      inputMode="numeric"
                      className="text-center text-[22px] tracking-[0.5em]"
                      autoFocus
                    />
                  </Field>

                  {isNewUser ? (
                    <Field label="Your name" hint="Used on your bookings so the stylist knows who is coming.">
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Aarav Mehta"
                        autoComplete="name"
                      />
                    </Field>
                  ) : null}

                  {error ? <Alert tone="danger">{error}</Alert> : null}

                  <Button variant="brand" size="lg" className="w-full" loading={busy} onClick={verify}>
                    <IconLock size={17} /> Verify and continue
                  </Button>
                  <Button variant="quiet" className="w-full" onClick={requestOtp} disabled={busy}>
                    Resend code
                  </Button>
                </div>
              </>
            )}
          </Card>

          {/* Native shells: which server this phone talks to. Open by default
              only when the build ships no address at all. */}
          {isNative() ? <ServerCard defaultOpen={!getApiBase() && !buildApiBase()} /> : null}

          {demo && demo.accounts.length ? (
            <Card className="mt-4 overflow-hidden">
              <button
                className="flex w-full items-center justify-between px-5 py-4 text-left"
                onClick={() => setDemoOpen((v) => !v)}
              >
                <span>
                  <span className="block text-[13.5px] font-semibold text-ink-800">Demo accounts (development only)</span>
                  <span className="block text-[12px] text-ink-400">
                    Seeded demo logins so every role can be reviewed without a real OTP provider.
                  </span>
                </span>
                <span className="text-ink-400">{demoOpen ? '−' : '+'}</span>
              </button>
              {demoOpen ? (
                <div className="border-t border-ink-100 p-3">
                  <div className="space-y-1.5">
                    {demo.accounts.map((account) => (
                      <button
                        key={account.phone}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-ink-50"
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const signedIn = await signIn(account.phone, demo.password);
                            toast.success(`Signed in as ${ROLE_LABEL[signedIn.role as Role]}`);
                            navigate(homePath(signedIn.role), { replace: true });
                          } catch (err) {
                            toast.error('Demo sign in failed', err instanceof Error ? err.message : undefined);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Avatar name={account.name} size={32} tone="brand" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink-800">{account.name}</span>
                          <span className="block text-[11.5px] text-ink-400">
                            {ROLE_LABEL[account.role as Role]} · {account.phone}
                          </span>
                        </span>
                        <span className="text-[11.5px] font-medium text-brand-600">Sign in</span>
                      </button>
                    ))}
                  </div>
                  <p className="px-2.5 pt-2 text-[11.5px] text-ink-400">
                    Password for every demo account: <span className="font-medium text-ink-600">{demo.password}</span>. This
                    panel never appears in production.
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
