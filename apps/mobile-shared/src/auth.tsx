/**
 * Session state for both apps.
 *
 * A bearer token in AsyncStorage is the whole session: the provider restores it
 * on launch, keeps the user object fresh, and reacts to a 401 from anywhere by
 * dropping back to the sign-in screen (see `onSignedOut` in `api.ts`).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { initApiBase, initToken, onSignedOut, setToken } from './api';
import { auth } from './endpoints';
import type { SessionResponse } from './types';
import type { SessionUser, Wallet } from '../core';

interface AuthValue {
  /** False until the stored session has been read — screens show a splash. */
  ready: boolean;
  user: SessionUser | null;
  wallet: Wallet | null;
  signIn: (session: SessionResponse) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Update the cached user without a round trip (after a profile edit). */
  patchUser: (patch: Partial<SessionUser>) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([initApiBase(), initToken()]);
      try {
        const me = await auth.me();
        if (!mounted.current) return;
        setUser(me.user);
        setWallet(me.wallet);
      } catch {
        /* No session, expired, or the server is unreachable: the gate shows the
         * sign-in screen, where the address can be checked. */
      } finally {
        if (mounted.current) setReady(true);
      }
    })();
  }, []);

  useEffect(
    () =>
      onSignedOut(() => {
        if (!mounted.current) return;
        setUser(null);
        setWallet(null);
      }),
    [],
  );

  const signIn = useCallback(async (session: SessionResponse) => {
    await setToken(session.token);
    setUser(session.user);
    setWallet(session.wallet ?? null);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await auth.logout();
    } catch {
      /* offline or already invalid — clearing locally is still correct */
    }
    await setToken(null);
    setUser(null);
    setWallet(null);
  }, []);

  const refresh = useCallback(async () => {
    const me = await auth.me();
    if (!mounted.current) return;
    setUser(me.user);
    setWallet(me.wallet);
  }, []);

  const patchUser = useCallback((patch: Partial<SessionUser>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ ready, user, wallet, signIn, signOut, refresh, patchUser }),
    [ready, user, wallet, signIn, signOut, refresh, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** Roles that may open the admin app. */
export const ADMIN_ROLES = ['salon_owner', 'branch_manager', 'receptionist', 'stylist', 'super_admin'];

export function isAdminRole(role: string | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}
