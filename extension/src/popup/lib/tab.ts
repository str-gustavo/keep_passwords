import { useEffect, useState } from 'react';
import { hostOf } from '@/shared/domain';

/** The tab the popup was opened over. */
export interface ActiveTab { id: number; url: string; host: string | null }

/** The active tab of the current window; `host` is null for pages that hold no records (chrome://, the popup itself…). */
export async function activeTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined || !tab.url) return null;
  return { id: tab.id, url: tab.url, host: hostOf(tab.url) };
}

/** `undefined` while loading, then the active tab (or null when there is none the popup can use). */
export function useActiveTab(): ActiveTab | null | undefined {
  const [tab, setTab] = useState<ActiveTab | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    activeTab().then((t) => { if (alive) setTab(t); }, () => { if (alive) setTab(null); });
    return () => { alive = false; };
  }, []);
  return tab;
}
