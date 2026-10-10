# Using Archivr in your browser

Chrome 123 or newer; use an Archivr account with the User role and a compatible server. See the [installation guide](../README.md#install).

## Connect

Enter the server address, allow access to that host, and click **Connect**. Explicit `http://` and `https://` origins are honored. Bare hostnames default to HTTP; an explicit port `443` uses HTTPS. `localhost:8080`, `example.com:443`, and `https://example.com` work. Credentials, non-root paths, queries, and fragments are rejected.

The extension opens or reuses a tab at the chosen server origin. Log in there normally. Keep the extension’s welcome page open: it checks the logged-in account and creates one API token named **Archivr Chrome extension**. The account must have the **User** role (bit `2`). Select an archive if the server exposes more than one.

The server’s session stays in its tab. No cookies are copied. Pairing runs in Chrome’s isolated world on the same origin; the API token is saved in storage restricted to trusted extension contexts. Content scripts receive only a capture adapter and the selected archive ID. Background requests use a bearer token, omit cookies, reject redirects, and stay pinned to the configured origin.

One server is connected at a time. Settings can switch archives or disconnect/change servers. Disconnect revokes the extension token. If the server is unreachable, **Forget connection locally** removes the local connection; revoke the old token from Archivr’s API-token settings when the server is reachable. Revoked/missing tokens can be disconnected immediately.

If token creation is interrupted, the extension does not mint another token automatically. Review Archivr’s API tokens, revoke any extra extension token, and use **Reset pairing**. A failed capture POST is also never retried automatically.

## Capture

- Use **Archive this page** in the toolbar popup or the page context menu for ordinary HTTP/HTTPS pages.
- Select text and choose **Archive selected text**. Its first nonempty line becomes an editable title, capped at 80 characters; its plain-text body remains editable. AI title generation is available only when manually requested.
- X/Twitter uses Chrome’s native right-click menus for **Archive Tweet**, **Archive this thread**, and (on an actual video player) **Archive video**. Some current X video players suppress Chrome’s menu and render their own menu instead; after that exact video click, Archivr adds one temporary **Archive video** action to X’s English `Dropdown` menu when its direct video rows are **Copy video address**, **Copy link at current time**, and **Post Video**. Other languages or changed menu wording do not receive this temporary action. It does not add permanent page buttons or change an unsuppressed native menu. Timeline, notification, detail, reply, and OldTwitter-style `div.tweet[data-tweet-id]` layouts are supported; viewer rows without that data attribute use their own `.tweet-time` permalink. Right-click a post body, action row, timestamp, image, video, or link. Media and ordinary links use their containing post’s own timestamp permalink; an explicit quoted-post timestamp/link uses the quoted post. A feed/background or ambiguous notification click does not guess a status.
- **Archive video** is offered only for an X video/player target and captures `x:media:<tweet-id>`. Pictures, avatars, post text/actions, external media, arbitrary site video controls, and generic X menus do not receive a video capture action. Quoted video uses the quoted tweet’s ID. The temporary X-menu action validates the same fresh page and video owner again when clicked. Tweet and thread actions remain available on X images and videos; selected text and YouTube controls keep their normal menus.
- On YouTube, choose **Archive with Archivr** in the native right-click menu. The generic **Archive this page** context-menu row is hidden on YouTube and `youtu.be`, leaving one applicable action. A clicked link, thumbnail, or video-card metadata wins over the current page; a background click uses the current video, playlist, or channel. Video captures use a canonical `watch?v=…` URL with playlist parameters removed; Shorts and `youtu.be` links are supported.
- Playlists and channels open Archivr with the capture dialog prefilled, allowing review of the container’s options and video list before submitting. They are never submitted automatically.

The in-page dialog and notifications render inside closed ShadowRoots, using scoped Archivr styles and bundled fonts with system fallbacks. Onboarding, settings, the popup, and fallback capture pages share Archivr’s typography, colors, fields, buttons, and focus treatment. Browser-native context menus keep the browser’s appearance; the injected X video-menu action follows its host menu and carries the Archivr mark. Generic sites receive the content script only after a user action through `activeTab`; X and YouTube have persistent host permissions for resolving right-click targets. The extension does not copy a site’s cookies or transfer its live DOM. Files cannot be uploaded through extension v1; use Archivr’s server UI for file captures.

Chrome blocks injection on its internal pages, the Chrome Web Store, and some protected viewers. The extension opens a capture tab with a helpful message when injection is unavailable. Paste a supported URL there. A container capture still needs access to the configured server.

Capture jobs are stored with their server origin and archive. The service worker uses alarms to poll after the dialog/tab closes or the worker restarts. The toolbar badge, popup’s recent captures, and in-tab notifications show progress or errors. **Open in Archivr** opens the configured archive. Running jobs remain associated with their original archive if you change the default.

Static document URL filters expose the X and YouTube menus. The content script records a short-lived right-click snapshot in the document. Menu dispatch asks the clicked tab for that snapshot and checks its age, exact page URL, and X target kind/ID, so worker suspension does not discard the target and navigation cannot reuse an earlier page’s target. Every background click replaces the previous snapshot; a video command additionally requires a fresh matching video snapshot. Chrome’s explicit status-link URL remains authoritative.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Chrome cannot load the manifest | Load `dist`, not the source root. Run `bun run build`, then reload the extension card. |
| Changes do not appear | Reload the extension and refresh existing X/YouTube tabs; old content scripts stay in loaded pages. |
| Connection fails | Verify the exact origin and browser reachability. Grant access to that host and log in in the server tab. |
| Pairing needs review | Check the named extension token in Archivr, revoke any extra token, then use Reset pairing. |
| Server returns 404 for capture options or text titles | The server is missing the extension-compatible API. Update it through its documented installation process. |
| Archive video is absent on X | Right-click the actual video player. The injected custom-menu action supports the specified English video menu only. Images and unrelated menus do not qualify. |
| A protected page opens a separate capture tab | Chrome refused injection. Use the fallback tab to review a supported URL. |
| Authorization expires or is revoked | Reconnect from settings and check the selected archive. Captures are never automatically retried. |

For a reproducible bug, include extension/browser versions, the action taken, expected/actual behavior, and a sanitized public example. Never attach tokens, cookies, credentials, or a personal archive.
