# Extension UI consistency — 2026-10-08

The main Archivr frontend remains the design source. The extension uses its
CSS variables, logo mark, capture dialog, and notification classes. No main-app
sources are changed in this follow-up.

## Surfaces

| Surface | Treatment |
| --- | --- |
| Welcome and pairing | Paper background, Archivr wordmark, Cormorant headings, labeled fields, dark primary action, muted guidance and clear errors |
| Settings and connection recovery | Same form/control treatment, archive selection, busy states, wrapping addresses and review/reset/disconnect feedback |
| Toolbar popup and recent captures | Compact version of the same composition; status/error text and actions remain readable at 360 px |
| In-page and fallback capture | Shared CaptureDialog, editable title/body, native shared advanced options and switches; fallback dialog sits outside page-specific descendant rules |
| Notifications | Shared paper toast layout, status accent, separate headline/detail, dismiss and Open in Archivr; keyboard/hover interaction pauses dismissal |
| X custom video-menu row | Existing host-matched font/color and rounded Archivr mark; native X layout and reinsertion behavior retained |
| Browser context menus and toolbar badge | Browser-owned presentation; descriptive action labels and existing brand icons |

Cormorant Garamond and Spectral weights 500/600 are bundled with OFL licenses.
Extension pages register them through local CSS. Injected surfaces register
byte-backed FontFaces fetched in Chrome's isolated world, which works under a
host `font-src 'none'` policy. Fonts retain system fallbacks. Capture/notification
styles live in closed ShadowRoots and do not repaint host-page controls.

On YouTube and youtu.be, **Archive with Archivr** is the single applicable page
context-menu action. **Archive this page** is hidden there and restored elsewhere.
Selected text remains a separate action. Existing video/playlist/channel target
resolution is unchanged. Chrome offers no exclusion URL pattern, so updates
follow active-tab navigation, activation, and window focus. Updates are serialized
and query the current focused tab when applied, preventing stale events from
winning. No additional permissions are requested.

## Verification scope

`bun run test:ui` records fourteen production-bundle fixture surfaces in
`artifacts/ui`, checks horizontal overflow, compares computed capture-submit
styles across both dialog surfaces, and covers batch/repeated/warning feedback.
Its bridge is mocked; no live user archive or paid title-generation call is used.
The packaged Chromium smoke separately loads the real extension and exercises
its service worker, tab events and context-menu API, isolated notifications, and
actual local font glyph metrics under a restrictive host font policy.

The X custom-menu browser suite checks its injected row and lifecycle. Native
OS menu painting and live-site DOM changes require a regular browser smoke;
those menus intentionally retain Chrome's own presentation.
