# Verification — 2026-10-06 — extension 0.1.1

## Automated checks

- Archivr core: `cargo test -p archivr-core` — 462 tests passed. Final focused `cargo test -p archivr-core downloader::tweets::tests --quiet` — 10 passed.
- Extension: `bun test` — 26 tests, 271 assertions passed; `bun run typecheck` and `bun run zip` passed.
- ZIP inspection: 15 members / 13 files; version 0.1.1; packaged bytes exactly match the current `dist` files. Required pages, worker, content bundle, logo and icons present; no stale chunks, Finder metadata, Git internals, node_modules or remote CSS/SVG font imports. Packaging recreates the ZIP rather than appending to an older archive.
- GPT-6.1 Sol High reviewed the code. Terra workers fixed relative-link resolution, media/link menu coverage, non-link YouTube card routing and worker-suspension handling. The final independent recheck reported no actionable findings.
- Unchanged server/shared frontend baseline from the initial implementation: 166 server tests and 16 frontend tests passed. The shared frontend was rebuilt for this smoke test; generated server static files were restored afterward.

## Chromium smoke

The final built extension was exercised in Chrome for Testing 151 with a disposable Archivr archive and a fresh browser profile:

1. Existing server-tab login pairs and creates the named extension API token; the trusted status response excludes credentials.
2. Native X Tweet and Thread actions open reviewable capture drafts with the same exact string ID and distinct `x:tweet:ID` / `x:thread:ID` intent. Relative timestamp links resolve correctly.
3. Post videos and ordinary external links resolve to their containing post; an explicitly clicked quoted-post permalink selects that quoted post.
4. Chromium’s service worker was stopped through CDP after a post target was recorded. The restarted worker had fresh globals, fetched the snapshot from the still-open document and opened the correct Thread draft.
5. Advanced options, editable text title/body, manual title generation, plain-text format, submission, completion polling and persisted real text entries work.
6. A video thumbnail and non-link card metadata on a YouTube channel resolve to that video. The dialog probes formats and permits 720p selection.
7. No inline Archive buttons are installed, including after adding posts and changing the fixture route.
8. A playlist opens the pinned server archive with a prefilled dialog. The URL request is consumed without submitting.
9. Closing/reopening the browser preserves the connection and completed jobs. No page errors occurred.
10. The exact reported raw X URL and its `x:thread:2107253221244715130` shorthand completed through the disposable server API using a fake scraper. Logged scraper arguments preserved the full ID and selected `--no-recursive` for Tweet versus the existing recursive thread flags for Thread.

The harness pregranted only the disposable localhost host permission because headless Chrome cannot accept its native permission prompt. X/YouTube used controlled DOM fixtures. It dispatched contextmenu events and invoked the registered production native-menu callback through test-only instrumentation; native menu presentation was not visually tested. Closed ShadowRoots were opened only in the fixture for inspection. Local fake title/media/tweet executables avoided live account data and paid model calls. Real site DOM changes, native permission prompts and live downloads remain manual checks in README.

Preview images are under `artifacts/`: welcome.png, connected.png, capture-advanced.png, capture-text.png, capture-video.png.
