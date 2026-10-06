# Archivr Chrome extension

A Manifest V3 extension for a self-hosted Archivr server. It reuses Archivr’s React capture dialog, logo, and styles. Chrome 123 or newer is required.

## Build and install

Install Bun, and place this repository next to an up-to-date `archivr` checkout:

```text
personal/
  archivr/
  archivr-extension/
```

```sh
bun install
bun run test
bun run typecheck
bun run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository’s `dist` directory. The welcome page opens on first installation. After a rebuild, use **Reload** on the extension card, then reload any X or YouTube tabs.

An alternate shared frontend source directory is supported:

```sh
ARCHIVR_SOURCE_DIR=/absolute/path/archivr/frontend/src bun run build
```

All runtime JavaScript, styles, and images are included in `dist`; it does not load code or fonts from a CDN. React is deduplicated across the extension and the shared frontend. `bun run dev` watches both source trees and rebuilds the unpacked extension. `bun run zip` creates `artifacts/archivr-extension.zip`.

**Update and rebuild the Archivr server too.** This extension needs the matching server/frontend changes for `GET /api/captures/options`, manual text-title generation, the reusable capture dialog, and `?archive=…&capture=…` deep links. An older server installation will not support these features. Rebuild/deploy the updated Archivr checkout using its normal documented deployment flow.

## Connect

Enter the server address, allow access to that host, and click **Connect**. Explicit `http://` and `https://` origins are honored. Bare hostnames default to HTTP; an explicit port `443` uses HTTPS. `localhost:8080`, `example.com:443`, and `https://example.com` work. Credentials, non-root paths, queries, and fragments are rejected.

The extension opens or reuses a tab at the chosen server origin. Log in there normally. Keep the extension’s welcome page open: it checks the logged-in account and creates one API token named **Archivr Chrome extension**. The account must have the **User** role (bit `2`). Select an archive if the server exposes more than one.

The server’s session stays in its tab. No cookies are copied. Pairing runs in Chrome’s isolated world on the same origin; the API token is saved in storage restricted to trusted extension contexts. Content scripts receive only a capture adapter and the selected archive ID. Background requests use a bearer token, omit cookies, reject redirects, and stay pinned to the configured origin.

One server is connected at a time. Settings can switch archives or disconnect/change servers. Disconnect revokes the extension token. If the server is unreachable, **Forget connection locally** removes the local connection; revoke the old token from Archivr’s API-token settings when the server is reachable. Revoked/missing tokens can be disconnected immediately.

If token creation is interrupted, the extension does not mint another token automatically. Review Archivr’s API tokens, revoke any extra extension token, and use **Reset pairing**. A failed capture POST is also never retried automatically.

## Capture

- Use **Archive this page** in the toolbar popup or the page context menu for ordinary HTTP/HTTPS pages.
- Select text and choose **Archive selected text**. Its first nonempty line becomes an editable title, capped at 80 characters; its plain-text body remains editable. AI title generation is available only when manually requested.
- X/Twitter posts have an **Archive** button beside their action row. It uses that post’s own timestamp permalink, including on detail pages. The observer follows SPA changes and reads the current identity again when clicked.
- YouTube videos have Archive controls, and link/page context menus offer **Archive video**, **Archive playlist**, or **Archive channel**. A clicked link or thumbnail wins over the current page. Video captures use a canonical `watch?v=…` URL with playlist parameters removed; Shorts and `youtu.be` links are supported.
- Playlists and channels open Archivr with the capture dialog prefilled, allowing review of the container’s options and video list before submitting. They are never submitted automatically.

The in-page dialog renders inside a ShadowRoot, using scoped Archivr styles and local font fallbacks. Generic sites receive the content script only after a user action through `activeTab`; X and YouTube have persistent host permissions for their controls. The extension does not copy a site’s cookies or transfer its live DOM. Files cannot be uploaded through extension v1; use Archivr’s server UI for file captures.

Chrome blocks injection on its internal pages, the Chrome Web Store, and some protected viewers. The extension opens a capture tab with a helpful message when injection is unavailable. Paste a supported URL there. A container capture still needs access to the configured server.

Capture jobs are stored with their server origin and archive. The service worker uses alarms to poll after the dialog/tab closes or the worker restarts. The toolbar badge, popup’s recent captures, and in-tab notifications show progress or errors. **Open in Archivr** opens the configured archive. Running jobs remain associated with their original archive if you change the default.

Chrome has no `contextMenus.onShown` event. Static target/document URL filters choose the normal YouTube menu items; an isolated pre-context pointer target updates the image/video label where Chrome permits it. Menu dispatch independently resolves the exact clicked target, with page identity only as a fallback.

## Smoke checks

Use a disposable archive and a current server:

1. Load `dist` unpacked. Enter a host with a port; reject a path or embedded credentials. Confirm the host permission request and server tab.
2. Log in to an account without the User role: pairing must refuse capture. Log in to a User account: exactly one extension token should appear. Reload the onboarding tab during polling and verify it does not mint another token.
3. Choose a non-default archive on a multi-archive server. Capture a normal page. Check the capture in that archive and verify popup status updates.
4. Select multiline Unicode text. Confirm the first nonempty line becomes the title and that body editing and manual title generation work. Capture without AI generation too.
5. On X, test a timeline post, detail post, quoted post, and a recycled row after SPA navigation. Ensure the outer post’s URL is captured.
6. On YouTube, right-click a video on a channel or playlist page. Capture the clicked video only. Test a playlist/channel link, Shorts, and a `youtu.be` URL. Containers must open the prefilled server dialog without submitting.
7. Start a capture, close the popup/dialog, then stop/restart the service worker from `chrome://extensions`. Verify the alarm resumes polling and the job settles.
8. Revoke the extension token in Archivr and verify capture fails clearly; Disconnect should clear the revoked connection. Test offline Disconnect’s local-forget recovery separately.
9. Test a `chrome://` page and the Web Store: the fallback capture tab should appear with a helpful message.
10. Inspect content-script messages/storage: settings/token access must be denied, unknown API methods rejected, and all capture requests pinned to the selected archive/server.

Automated Bun tests cover origin normalization, URL/container routing, selected text, sender roles and API allowlists, durable job identity, shorthand locator restrictions, and UTF-8 byte limits. Type checking and both Vite builds are part of the build verification; live Chrome checks are still needed for site DOM changes and permissions behavior.
