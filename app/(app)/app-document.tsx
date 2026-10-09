import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { Toaster } from '@/components/ui/Toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const appMetadata: Metadata = {
  title: 'Nexus Passwords',
  description: 'Gerenciador de senhas da Nexus Logtec com criptografia de ponta a ponta',
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/icons/icon-32.png', type: 'image/png', sizes: '32x32' }],
    apple: '/apple-touch-icon.png',
  },
};

const THEME_SCRIPT = "try{var t=localStorage.getItem('keep-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}";

/**
 * The web app's <html> document: the root layout of the "(app)" route group and of app/global-not-found.tsx (the 404 of
 * unknown URLs, which has no root layout above it since the app has two: "(app)" and the E2E "(fixtures)").
 */
export function AppDocument({ children }: { children: React.ReactNode }) {
  return (
    // data-nexus-app: the Nexus Passwords extension never injects its fill icon into the app itself.
    <html lang="pt-BR" data-nexus-app="1" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={inter.variable}>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
