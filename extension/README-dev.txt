Nexus Passwords - browser extension (Chrome, Edge, Brave; Manifest V3)
=======================================================================

All commands run from the repository root (npm workspace "extension").

Build
-----
  npm install            (once; installs the workspace dependencies)
  npm run ext:build      -> extension/dist/
                            manifest.json  (manifest.json + the fixed public key from key.json)
                            sw.js          (service worker, ES module)
                            content.js     (content script, single IIFE)
                            popup.html + assets/  (React popup)
                            offscreen.html + assets/offscreen.js  (clears the clipboard 30 s after a copy)
                            icons/

  Dev/E2E only: NEXUS_DEV_HOST=http://localhost:3100 npm run ext:build
  also adds that origin to host_permissions, so the extension can call a local
  server without a permission prompt. Never ship a build made this way: use ext:zip.

Load it unpacked
----------------
  1. Open chrome://extensions (edge://extensions, brave://extensions).
  2. Turn on "Developer mode".
  3. "Load unpacked" -> choose the extension/dist folder.
  4. After every rebuild, press the reload icon on the extension card.

Stable extension id
-------------------
  extension/key.json holds the PUBLIC key (and the id derived from it); copy-static
  puts it in dist/manifest.json as "key", so every unpacked build keeps the same id:

    node -p "require('./extension/key.json').id"

  The popup can be opened in a normal tab at chrome-extension://<id>/popup.html.
  Do not regenerate key.json unless you mean to change the id
  (npm run gen-key -w extension -- --force). No private key is stored anywhere:
  Chrome only needs the public key to fix the id of an unpacked build.

Package for the Chrome Web Store
--------------------------------
  npm run ext:build && npm run ext:zip
  -> extension/release/br.com.nexuslogtec.passwords-<version>.zip (name from extension/package.json)
  The zipped manifest has no "key" (the store assigns its own id) and no
  "host_permissions". The version comes from manifest.json, which a test keeps
  equal to the root and workspace package.json versions.

Checks
------
  npm run ext:check      typecheck + vitest (jsdom, in-memory chrome mock in
                         extension/tests/helpers/chrome-mock.ts)
  npm run check          the whole repo, including ext:check

Imports
-------
  @app/*  -> ../lib/*  (code shared with the web app: crypto, record types, vault decrypt, API types)
  @/*     -> extension/src/*
  @/lib/* -> ../lib/*  (the shared lib files import each other this way; never create extension/src/lib/)

Chrome Web Store account
------------------------
  The Web Store developer account is separate from the Google Play Console:
  register once at https://chrome.google.com/webstore/devconsole (one-time US$5 fee),
  then "New item" -> upload the zip. Extension ids cannot be reverse-domain names;
  br.com.nexuslogtec.passwords is the package/zip name only. Edge and Brave install
  extensions from the Chrome Web Store.

Permissions shown at install
----------------------------
  storage, alarms, tabs, scripting, activeTab, offscreen, clipboardWrite
  ("Modify data you copy and paste": used only to clear the clipboard after a copy).
  Access to the server origin is requested in the popup when the server URL is set.
