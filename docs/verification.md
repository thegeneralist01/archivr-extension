# Verification — 2026-10-07 — extension 0.1.2

## Automated checks

- Shared frontend: `bun test` — 22 tests, 79 assertions passed; `bun run build` passed. Includes whole-tweet URL variants/aliases with restored empty, nonempty or probing state, plus explicit media quality controls.
- Extension: `bun test` — 34 tests, 299 assertions passed; `bun run typecheck` and final `bun run zip` passed.
- Server: `cargo build -p archivr-server --quiet` passed; existing unrelated unused-mut warning remains. No Rust sources were changed in this follow-up. The tweet scraper still includes `--download-media` by default.
- Final ZIP: 15 members / 13 files, manifest and package version 0.1.2. Packaged bytes exactly match current dist; no stale chunks, Finder metadata, Git internals, node_modules or remote CSS/SVG font imports.
- Terra workers implemented the extension/UI changes and fixed the initial review findings. GPT-6.1 Sol High spec recheck and independent code-quality/security review reported no remaining actionable findings.

## Chromium smoke

Final packaged source was exercised in Chrome for Testing with a fresh profile and disposable Archivr archive:

1. Server-tab login pairs normally; trusted status exposes no API token. Native menus register exactly one **Archive this thread**, while **Archive video** is restricted to video contexts on X/Twitter.
2. OldTwitter-style notification rows with data-tweet-id resolve their own 19-digit IDs. Tweet and Thread actions seed x:tweet and x:thread respectively; an explicit quoted permalink chooses its quote.
3. Dynamically added modern X article markup still resolves the correct Thread ID.
4. Thread/viewer reply rows without data-tweet-id use their own relative tweet-time permalink rather than the current page root or a quoted status.
5. Actual reply and quoted videos seed x:media with the correct owner ID. Explicit media probes formats and permits 720p selection. Whole Tweet/Thread actions also work when invoked on that video.
6. An image poster inside a wrapper containing a genuine video never produces a media snapshot. Artificially invoking the media command after the image click, even with a forged video type, does not open a media dialog. Native registration hides that command on image contexts.
7. Stopping/restarting the worker through CDP clears its globals but preserves the correct video target held by the document. Navigation invalidates the snapshot; a background click clears prior X ownership.
8. The exact https://x.com/cognition/status/2107165034463867001 URL produces no probe request, no obsolete No media hint and no quality control. Archive remains enabled. Tests additionally cover stale attachment-probe states.
9. Selected Unicode text remains editable. YouTube non-link card metadata resolves to the clicked canonical video and permits quality selection.
10. No permanent inline Archive buttons or automatic capture submission occur. The final run reports no page errors.

X pages used controlled markup fixtures informed by OldTwitter primary source (helpers.js and tweetviewer.js) and native X selectors. The harness dispatched real DOM contextmenu events, inspected content snapshots and invoked the registered production native-menu callback through test-only instrumentation. OS-native menu presentation was not visually tested. Closed ShadowRoots were opened only in the fixture for inspection. Local fake media/title executables avoided live account data and paid model calls. Only the disposable localhost host permission was pregranted because headless Chrome cannot accept its native permission dialog.

Current previews: artifacts/archive-video.png and artifacts/whole-tweet-no-media-hint.png. Reload the unpacked extension and refresh X tabs after updating; rebuild/deploy Archivr to load the shared capture-dialog fix.
