import { useCallback, useEffect, useRef, useState } from 'react';
import { Notice } from './controls';

export type NoticeState = { kind: 'error' | 'success'; text: string } | null;
export type Notify = (n: NoticeState) => void;

const SUCCESS_MS = 4_000;

/** One transient message per view: confirmations fade after a few seconds, errors stay until the next action. */
export function useNotice(): [NoticeState, Notify] {
  const [notice, setNotice] = useState<NoticeState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback<Notify>((n) => {
    clearTimeout(timer.current);
    setNotice(n);
    if (n?.kind === 'success') timer.current = setTimeout(() => setNotice(null), SUCCESS_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [notice, notify];
}

/** Pinned to the bottom of the scrolling panel, so it stays visible over a long list. */
export function NoticeBar({ notice }: { notice: NoticeState }) {
  if (!notice) return null;
  return <div className="sticky bottom-0 bg-surface p-3"><Notice kind={notice.kind}>{notice.text}</Notice></div>;
}
