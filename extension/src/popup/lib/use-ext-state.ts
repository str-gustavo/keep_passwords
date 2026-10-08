import { useCallback, useEffect, useRef, useState } from 'react';
import { send, type ExtState } from '@/shared/messages';
import { errorText } from './errors';

/** While the popup is open it re-reads the state this often, so an auto-lock shows up without reopening it. */
export const POLL_MS = 5_000;

/**
 * The service worker's ExtState: read on mount and every POLL_MS, and replaced by the state that every account action
 * (signIn, unlock, lock, …) answers with. A poll that was already in flight when a newer state arrived is dropped, so
 * a slow getState cannot undo a sign-in or a lock.
 */
export function useExtState() {
  const [state, setState] = useState<ExtState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const apply = useCallback((s: ExtState) => {
    generation.current += 1;
    setState(s);
    setError(null);
  }, []);

  const reload = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const s = await send<ExtState>({ type: 'getState' });
      if (mine === generation.current) { setState(s); setError(null); }
    } catch (e) {
      if (mine === generation.current) setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => { void reload(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return { state, error, reload, apply };
}
