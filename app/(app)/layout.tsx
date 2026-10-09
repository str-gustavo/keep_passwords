import type { Metadata } from 'next';
import { AppDocument, appMetadata } from './app-document';

export const metadata: Metadata = appMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <AppDocument>{children}</AppDocument>;
}
