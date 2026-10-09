import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Site de teste', robots: { index: false, follow: false } };

const CSS = `
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #f6f7f9; color: #1b1f24; }
main { max-width: 420px; margin: 48px auto; padding: 24px; background: #fff; border: 1px solid #d0d5dd; border-radius: 8px; }
label { display: block; margin: 12px 0; }
input { display: block; box-sizing: border-box; width: 100%; margin-top: 4px; padding: 8px 10px; font: inherit; border: 1px solid #98a2b3; border-radius: 6px; }
button { margin-top: 8px; padding: 8px 16px; font: inherit; }
`;

/**
 * Second root layout (route group "(fixtures)"), for the extension's E2E test pages only. Unlike the app's root layout
 * its <html> has no data-nexus-app, so the extension's content script treats these pages as any third-party site.
 * The pages themselves are gated by e2e-fixtures/layout.tsx (404 unless E2E_FIXTURES=1).
 */
export default function FixturesRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <style>{CSS}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
