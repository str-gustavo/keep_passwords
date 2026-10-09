// Offscreen document entry (offscreen.html, reason CLIPBOARD): opened by the service worker only to clear the
// clipboard 30 s after a copy from the popup, and closed right after.
import { installOffscreenClipboard } from './clipboard';

installOffscreenClipboard();
