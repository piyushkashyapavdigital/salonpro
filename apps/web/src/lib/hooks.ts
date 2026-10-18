import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api';

/** Thin typed wrapper so pages read like English. */
export function useApi<T>(path: string | null, options: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery<T, ApiError>({
    queryKey: ['api', path],
    queryFn: ({ signal }) => api<T>(path!, { signal }),
    enabled: (options.enabled ?? true) && Boolean(path),
    refetchInterval: options.refetchInterval,
    staleTime: 15_000,
  });
}

export function useApiMutation<TBody, TResult = unknown>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  pathBuilder: string | ((body: TBody) => string),
  options: { invalidate?: (string | null)[] | ((body: TBody, result: TResult) => (string | null)[]); onSuccess?: (result: TResult, body: TBody) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation<TResult, ApiError, TBody>({
    mutationFn: (body: TBody) => {
      const path = typeof pathBuilder === 'string' ? pathBuilder : pathBuilder(body);
      return api<TResult>(path, { method, body });
    },
    onSuccess: (result, body) => {
      const keys =
        typeof options.invalidate === 'function'
          ? options.invalidate(body, result)
          : options.invalidate ?? [];
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: ['api', key] });
      }
      void queryClient.invalidateQueries({ queryKey: ['api'] });
      options.onSuccess?.(result, body);
    },
  });
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Copy-to-clipboard with a transient "copied" state. */
export function useCopy(timeout = 1800) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), timeout);
    },
    [timeout],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { copied, copy };
}

/** Small derived-date helpers used across booking screens. */
export function nextDays(count: number, from = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return d;
  });
}
