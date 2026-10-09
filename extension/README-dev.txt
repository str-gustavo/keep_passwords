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
  storage, alarms, tabs, offscreen, clipboardWrite
  ("Modify data you copy and paste": used only to clear the clipboard after a copy).
  Access to the server origin is requested in the popup when the server URL is set.
  The content script runs on <all_urls> (it finds login forms on any site), which
  Chrome shows as "Read and change all your data on all websites".
  A test (extension/tests/manifest.test.ts) keeps the list above equal to manifest.json.

Web Store listing checklist
---------------------------
  Before submitting a version to the Chrome Web Store (Developer Dashboard):
  [ ] Privacy policy URL (Privacy tab). Mandatory: the extension handles credentials
      ("authentication information" and "website content" in the data-use form).
      State: zero-knowledge, the master password never leaves the device, the
      decrypted vault lives only in memory (chrome.storage.session), nothing is sold
      or shared, no analytics.
  [ ] Single-purpose description: "Fill and save the passwords of your Nexus
      Passwords vault on the sites you visit." Everything in the listing must serve
      that one purpose.
  [ ] Permission justifications (Privacy tab, one per permission):
      - storage: the configured server, the e-mail of the last sign-in and the
        "never for this site" list (storage.local); the session and decrypted vault
        (storage.session, memory only, cleared on lock and browser close).
      - alarms: the once-a-minute auto-lock check and the clipboard clear 30 s
        after a copy, which must run even when the service worker was stopped.
      - tabs: read the active tab's URL to show the records for that site and the
        toolbar badge count, and send fill requests to that tab's content script.
      - offscreen: an offscreen document (reason CLIPBOARD) clears the clipboard
        30 s after a copy, with the popup closed.
      - clipboardWrite: copying a login, password or 2FA code, and clearing it.
      - content script on <all_urls> (broad host access, triggers the in-depth
        review): login, sign-up and 2FA forms can be on any site; the script only
        detects forms, offers fill/save, and receives a credential only for the
        site the service worker matched it to. No remote code; no host_permissions
        in the store build (the server origin is an optional permission).
  [ ] Remote code: "No, I am not using remote code".
  [ ] Screenshots: 1280x800 (or 640x400) PNG/JPEG, at least 1, up to 5
      (popup over a login page, inline fill menu, save bar, generator).
  [ ] Small promo tile: 440x280 PNG/JPEG.
  [ ] Store icon: 128x128 (icons/icon-128.png in the zip).
  [ ] Zip from `npm run ext:zip` (no "key", no "host_permissions"), version bumped
      in manifest.json and both package.json files.
