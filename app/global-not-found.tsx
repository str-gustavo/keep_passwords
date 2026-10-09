import type { Metadata } from 'next';
import { AppDocument, appMetadata } from './(app)/app-document';
import NotFound from './(app)/not-found';

// Unknown URLs (experimental.globalNotFound, needed with two root layouts): the app's own 404, in the app's document.
export const metadata: Metadata = appMetadata;

export default function GlobalNotFound() {
  return <AppDocument><NotFound /></AppDocument>;
}
