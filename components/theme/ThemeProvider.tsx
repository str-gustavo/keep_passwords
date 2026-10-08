'use client';
import { createContext, useContext, useEffect, useState } from 'react';
type Theme = 'light' | 'dark';
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    let initial: Theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    try { const saved = localStorage.getItem('keep-theme'); if (saved === 'dark' || saved === 'light') initial = saved; } catch {}
    setTheme(initial);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('keep-theme', theme); } catch {} }, [theme]);
  return <Ctx.Provider value={{ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
