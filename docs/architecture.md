# Architecture

The extension is a Bun/Vite-built Chrome Manifest V3 application using React 18 and strict TypeScript. Runtime assets are bundled; the shared Archivr capture UI is imported at build time from a companion source checkout.

## Boundaries and flow

```text
popup / settings (trusted extension pages)
             | runtime messages
             v
service worker -- origin/archive-pinned bearer API --> configured Archivr
             ^
             | allowlisted capture messages / job status
             v
content script (isolated world)
  | DOM target snapshot         | capture adapter
  v                             v
native or recognized X menu     shared CaptureDialog in closed ShadowRoot
```

`src/background.ts` owns credentials, host permissions, pairing recovery, permitted network calls, stored jobs and native menu dispatch. `src/core.ts` validates origins/locators, authorizes sender contexts, resolves URL/container routing and preserves job identity. `src/messages.ts` records the protocol; `src/bridge.ts` is the shared dialog’s narrow API adapter.

`src/content.ts` captures a short-lived top-level right-click snapshot through `src/site-targets.ts`. Post IDs remain strings. The worker requests and validates that snapshot at dispatch, so suspension does not erase targeting and navigation cannot reuse old ownership. `src/x-video-menu.ts` handles only the recognized English X video menu after a trusted video click, maintaining one branded row while the menu is open. `src/menu-visibility.ts` serializes active-tab/window updates to hide the generic page row on YouTube.

## Pairing and capture lifecycle

1. The user supplies an origin and grants access to its host.
2. The worker opens/reuses that server’s tab and checks its logged-in account in the isolated world.
3. One named API token is minted. A worker interruption during minting moves pairing to review rather than minting a duplicate.
4. The user chooses an archive. Site actions seed a capture dialog, while playlist/channel targets open the server’s capture UI.
5. Explicit submission creates a job saved with its origin/archive identity. Worker alarms resume polling after the UI closes or worker sleeps.
6. Notifications, popup history and the toolbar badge report progress/errors; opening a job uses its saved archive.

No arbitrary URL fetch bridge exists. API paths are allowlisted, requests omit cookies and reject redirects, and content scripts cannot access the bearer token. Capture POSTs are not automatically retried.

## UI and build

`src/app.tsx` renders onboarding, settings, popup and fallback capture. Shared dialogs sit outside extension-page descendant selectors. `src/dialog.tsx` hosts injected dialogs/notifications in closed ShadowRoots; `src/notifications.tsx` correlates per-job feedback, removes settled progress and preserves batch headlines/warnings.

Shared CSS tokens and bundled Cormorant Garamond/Spectral faces retain Archivr’s design. `src/css.ts` strips remote font imports and maps shared root selectors to shadow hosts. Injected faces are byte-backed FontFaces loaded in the isolated world, so restrictive host font policies do not prevent rendering.

`scripts/build.ts` builds extension pages/worker, then the content IIFE. It validates the manifest and fixes the production environment before JSX transformation. Vite copies `public` assets; license notices are copied into `dist`. `scripts/zip.ts` recreates the archive, avoiding removed files left in an old ZIP. Generated output is never edited or committed.

## Compatibility

Chrome 123+ is the current target. The API adapter requires capture options, text-title generation, text capture and capture-job polling in the companion server, plus the shared CaptureDialog adapter/seeding contract. CI pins a compatible source revision; see [Contributing](../CONTRIBUTING.md). Firefox, file upload through the extension, and browser-store publishing are not implemented.
