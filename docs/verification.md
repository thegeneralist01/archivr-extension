# Verification — 2026-10-06

## Automated checks

- Archivr core/server: `cargo test -p archivr-core -p archivr-server --quiet` — 460 core and 166 server tests passed.
- Shared frontend: `bun test` — 16 tests, 57 assertions passed; `bun run build` passed.
- Extension: `bun test` — 17 tests, 247 assertions passed; `bun run typecheck` and `bun run zip` passed.
- ZIP inspection: 20 members; required manifest/pages/worker/content bundle/logo/icons present; no node_modules/Git internals or remote CSS/SVG font imports.
- Independent spec and code/security reviews passed. Terra workers fixed the CSS import parser and public logo packaging; Terra review rechecked the final package.

## Chromium smoke

The built unpacked extension was exercised in Chrome for Testing 151 with a disposable Archivr archive and separate browser profile:

1. Existing server-tab login pairs and creates the named extension API token; trusted status response excludes credentials.
2. A synthetic X post with a quoted post archives its own permalink; one action button is installed and advanced switches render in Archivr style.
3. Title and body edits, manual title generation, plain-text format, capture submission, completion polling, and persisted real text entries work.
4. A synthetic YouTube video on a channel page resolves to the clicked video, drops playlist parameters, probes formats, and allows 720p selection.
5. A playlist opens the pinned server archive with a prefilled capture dialog; the URL request is consumed without submission.
6. Closing/reopening the browser and extension worker preserves the connection and completed job state.
7. Final smoke returned no page errors.

The smoke harness pregranted only the disposable localhost server permission because a headless test cannot accept Chrome’s native extension permission prompt. X/YouTube pages used controlled DOM fixtures, and title/media probes used local fake executables; no live account data or external paid model calls were used. Native permission prompts, site layout changes, and real downloads remain manual checks described in README.

Preview images are generated under `artifacts/`: welcome.png, connected.png, capture-advanced.png, capture-text.png, capture-video.png.
