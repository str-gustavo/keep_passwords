import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';
import keyFile from '../key.json';
import extensionPackage from '../package.json';
import rootPackage from '../../package.json';

describe('manifest.json', () => {
  it('is an MV3 manifest wired to the build outputs', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('Nexus Passwords');
    expect(manifest.background).toEqual({ service_worker: 'sw.js', type: 'module' });
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(manifest.content_scripts).toEqual([expect.objectContaining({ js: ['content.js'], matches: ['<all_urls>'] })]);
    // Web Store limit for the description.
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  it('keeps dev-only fields out of the source manifest', () => {
    // `key` is injected into dist/ by copy-static; host_permissions only with NEXUS_DEV_HOST; zip strips both.
    expect(manifest).not.toHaveProperty('key');
    expect(manifest).not.toHaveProperty('host_permissions');
    // A non-string default_locale (or one without _locales/) makes Chrome refuse to load the extension.
    expect(manifest).not.toHaveProperty('default_locale');
  });

  it('has the same version as the root and workspace package.json', () => {
    expect(manifest.version).toBe(rootPackage.version);
    expect(manifest.version).toBe(extensionPackage.version);
  });
});

describe('key.json', () => {
  it('holds a public key whose Chrome extension id matches `id`', async () => {
    const der = Uint8Array.from(atob(keyFile.key), (c) => c.charCodeAt(0));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der));
    const id = [...digest.slice(0, 16)]
      .flatMap((byte) => [byte >> 4, byte & 15])
      .map((nibble) => String.fromCharCode(97 + nibble))
      .join('');
    expect(keyFile.id).toMatch(/^[a-p]{32}$/);
    expect(id).toBe(keyFile.id);
    expect(Object.keys(keyFile).sort()).toEqual(['id', 'key']);
  });
});
