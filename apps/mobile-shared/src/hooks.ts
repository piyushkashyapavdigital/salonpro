/**
 * Data loading for screens: one hook that covers loading, error, pull-to-refresh
 * and optimistic updates, so every screen handles the boring states the same way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ApiError } from './api';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
  refresh: () => void;
  setData: (update: T | ((current: T | null) => T | null)) => void;
}

/** Human message for anything a loader can throw. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const next = await loaderRef.current();
      if (!alive.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (!alive.current) return;
      setError(errorMessage(err));
    } finally {
      if (alive.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void run('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  /* Refresh whenever the screen comes back into focus, so a booking made two
   * screens away is already reflected when the user returns. */
  const firstFocus = useRef(true);
  useFocusEffect(
    useMemo(
      () => () => {
        if (firstFocus.current) {
          firstFocus.current = false;
          return;
        }
        void run('refresh');
      },
      [run],
    ),
  );

  return useMemo(
    () => ({
      data,
      error,
      loading,
      refreshing,
      reload: () => run('initial'),
      refresh: () => void run('refresh'),
      setData: (update) =>
        setData((current) =>
          typeof update === 'function' ? (update as (c: T | null) => T | null)(current) : update,
        ),
    }),
    [data, error, loading, refreshing, run],
  );
}

/** Debounce a value (search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
