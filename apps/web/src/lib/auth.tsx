import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Role, SessionUser, Wallet } from '@salonpro/shared';
import { ADMIN_ROLES } from '@salonpro/shared';
import { ApiError, endpoints, getToken, setToken } from './api';

interface AuthState {
  user: SessionUser | null;
  wallet: Wallet | null;
  loading: boolean;
  error: string | null;
  signIn: (phone: string, password?: string) => Promise<SessionUser>;
  signInWithSession: (session: { token: string; user: SessionUser; wallet: Wallet | null }) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  isAdmin: boolean;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setWallet(null);
      setLoading(false);
      return;
    }
    try {
      const result = await endpoints.me();
      if (!mounted.current) return;
      setUser(result.user);
      setWallet(result.wallet);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setUser(null);
        setWallet(null);
      } else {
        setError(err instanceof Error ? err.message : 'Could not reach the server.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const onSignedOut = () => {
      setUser(null);
      setWallet(null);
    };
    window.addEventListener('salonpro:signed-out', onSignedOut);
    return () => {
      mounted.current = false;
      window.removeEventListener('salonpro:signed-out', onSignedOut);
    };
  }, [refresh]);

  const signIn = useCallback(async (phone: string, password?: string) => {
    const session = await endpoints.demoLogin(phone, password);
    setToken(session.token ?? null);
    setUser(session.user);
    setWallet(session.wallet);
    return session.user;
  }, []);

  const signInWithSession = useCallback((session: { token: string; user: SessionUser; wallet: Wallet | null }) => {
    setToken(session.token);
    setUser(session.user);
    setWallet(session.wallet);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await endpoints.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    setToken(null);
    setUser(null);
    setWallet(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      wallet,
      loading,
      error,
      signIn,
      signInWithSession,
      signOut,
      refresh,
      isAdmin: Boolean(user && ADMIN_ROLES.includes(user.role)),
      hasRole: (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
    }),
    [user, wallet, loading, error, signIn, signInWithSession, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
