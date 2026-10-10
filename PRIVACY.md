# Privacy

This document describes the development extension, version 0.1.4. It connects to one server chosen by you and has no extension analytics or advertising service.

## Data stored locally

Chrome extension `storage.local` holds the configured server origin, API token and token UID, account username, archive selection/list, pairing state, recent capture jobs, and temporary capture drafts. Access is restricted to trusted extension contexts. The content script receives a capture adapter and archive context, never the token. Capture drafts may include selected text or URLs; treat the browser profile as private data.

The shared capture dialog also uses session storage for draft continuity. **For an injected in-page dialog, this is the website origin’s session storage: scripts on that page can read the draft URLs, edited titles and text bodies.** A closed ShadowRoot and isolated JavaScript world do not make that storage private. Dialogs on extension pages use the extension origin’s session storage instead. Use Archivr’s own capture UI when the page should not see an edited draft.

In-page right-click snapshots are short-lived document state used to resolve the clicked target; navigation or a later click invalidates earlier targeting. Recent jobs are capped at 100. Stored fallback drafts are retained until browser extension data is cleared; they currently have no automatic expiry.

## Data sent

Pairing uses your existing login in a same-origin server tab to create the named extension token. The extension does not copy cookies from X, YouTube or other sites. Subsequent worker requests use a bearer token with cookies omitted and redirects rejected.

Captures send the reviewed URL/source locator, title/body for text, selected quality and options to your configured Archivr server. Job polling sends that capture’s job identity to the same server. Channels/playlists open its capture UI prefilled. Manual title generation sends the text to your server; its configured provider may process it under that provider’s policy.

Bundled JavaScript, styles, images and fonts load locally. Visiting a website and following ordinary browser links still causes that site’s own normal requests.

## Browser permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Connection, pairing, capture jobs and drafts |
| `activeTab` | User-invoked capture of the current ordinary page |
| `scripting` | Show the capture UI and pair through the server tab |
| `contextMenus` | Page, selected-text, X and YouTube archive actions |
| `alarms` | Poll capture progress after the worker sleeps or dialog closes |
| Persistent X/Twitter and YouTube host access | Resolve clicked posts/videos/links and integrate the supported X custom video menu |
| Optional HTTP/HTTPS host access | Grant access to your chosen Archivr server when connecting |

Chrome host grants are host/scheme based, while the worker additionally pins network requests to the exact configured origin, including its port. The manifest lists broad optional host patterns so different self-hosted servers can be selected; access is requested when you connect.

## Disconnecting and removing data

Disconnect in extension settings to revoke the token and clear the local connection. If the server is unavailable, **Forget connection locally** clears local connection state; revoke the token in Archivr when it is reachable. Disconnect/forget leaves stored job history and fallback drafts in place. Uninstalling removes extension storage but does not revoke a token on an unreachable server or delete already archived content.

Temporary drafts/session state belong to the browser profile and can be cleared through browser site/extension data controls. Capture data already sent to Archivr follows that server’s storage and deletion policy.

For suspected data exposure, follow [SECURITY.md](SECURITY.md). Sanitize diagnostic output before posting it.
