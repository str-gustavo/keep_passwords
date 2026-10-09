// Content script entry, injected into every frame (manifest content_scripts, run_at document_idle).
// Built as a classic-script IIFE (vite.content.config.ts): no import/export survives bundling.
import { startContentScript } from './controller';
import { installFillGenerated } from './fill-generated';

// Once per frame, even if the script is injected again into the same isolated world.
const STARTED = '__nexusPasswordsContent';
const scope = globalThis as unknown as Record<string, unknown>;
if (!scope[STARTED]) {
  scope[STARTED] = true;
  startContentScript(document);
  installFillGenerated(document);
}
