// Placeholder service worker (Task 4 scaffold); the real message router replaces it.
// Secrets will live in storage.session: keep it readable only by trusted extension contexts
// (the SW and extension pages), never by content scripts.
void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

chrome.runtime.onInstalled.addListener(() => {
  // Intentionally empty for now.
});
