# Agent instructions

## Scope and setup

This repository owns the Chrome Manifest V3 extension: service worker, content scripts, settings/onboarding, toolbar popup, packaging, and tests. It imports the shared capture UI from a sibling `archivr` checkout; that source is a build dependency, not a submodule or runtime download.

```sh
# From this repository; ../archivr/frontend/src must exist.
bun install --frozen-lockfile
bun run typecheck
bun run test
bunx playwright install chromium
bun run test:browser
bun run test:ui
bun run zip
```

Use Bun, not npm/yarn. `bun run dev` watches this repository and the shared frontend, rebuilding `dist`; Chrome still needs extension/tab reloads. `ARCHIVR_SOURCE_DIR` overrides build/watch source lookup. TypeScript paths currently require the default sibling layout.

Read [architecture](docs/architecture.md) for trust boundaries and [testing](docs/testing.md) for fixture limits. The shared-source revision used by CI is pinned in `.github/workflows/ci.yml`; test against that revision when reproducing CI.

For user-facing behavior, capture options, server API contracts, shared UI, permissions, docs, or branding, use Archivr's [ecosystem change checklist](https://github.com/thegeneralist01/archivr/blob/master/docs/ecosystem-change-checklist.md) before implementation and again before reporting completion. Record applicability, action or reason, verification, and links for all three projects, even when working directly without a PR. In particular, a new shared-dialog option must be reviewed against the worker's request allowlist.

## Source map

| Area | Files |
| --- | --- |
| Credentials, pairing, permitted API calls, durable jobs, native menu dispatch | `src/background.ts` |
| Pure input validation, sender authorization, URL routing, job identity | `src/core.ts` |
| DOM target ownership and snapshot freshness | `src/site-targets.ts`, `src/content.ts` |
| X custom video-menu discovery, branding, reinsertion and cleanup | `src/x-video-menu.ts` |
| Generic page-menu visibility on YouTube/tab/window changes | `src/menu-visibility.ts` |
| Shared API adapter and message contract | `src/bridge.ts`, `src/messages.ts` |
| Settings/onboarding/popup and page styling | `src/app.tsx`, `src/pages.css` |
| Isolated capture surfaces, shared notices, local fonts | `src/dialog.tsx`, `src/notifications.tsx`, `src/ui.css`, `src/fonts.*` |
| Builds, CSS import stripping, development watch, ZIP | `scripts/`, `src/css.ts` |
| Unit and trusted-event browser regressions | `tests/` |

## Conventions

- Strict TypeScript and React 18; double quotes, semicolons, plain CSS. Preserve the surrounding formatting and avoid unrelated reformatting.
- Reuse Archivr’s CaptureDialog, tokens, typography and toast classes. Keep extension-page descendant rules away from the shared dialog. In-page UI belongs in closed ShadowRoots.
- Store page/post IDs as strings; never convert 19-digit X IDs through JavaScript numbers.
- Keep URL normalization, validation and target resolution in the existing pure helpers where possible.
- Do not hand-edit `dist`, `artifacts`, or compiled shared frontend assets. Update source and rebuild.
- Manifest and package versions must agree. Permission changes must be documented in `PRIVACY.md` and the PR.
- Keep README for human quick-start information and detailed agent constraints here. User instructions override this file; a closer nested AGENTS.md governs its subtree.

## Security invariants

- The worker owns credentials. Keep storage at `TRUSTED_CONTEXTS`; never expose API tokens through STATUS, CAPTURE_CONTEXT, content messages, logs, screenshots, or fixtures.
- Validate message sender ID, extension-page URL or top-level content context, method allowlist and arguments. Do not add an arbitrary fetch bridge.
- Pin requests to the configured origin and selected archive; omit cookies and reject redirects. No cross-site cookie copying.
- Pair through the logged-in server tab in the isolated world. Interrupted token creation needs explicit recovery; captures and token minting are never automatically retried.
- X capture requires the fresh clicked document’s own post/video owner. Navigation, stale snapshots, poster images and detached/re-owned players must not reuse an earlier target.
- The injected X action is limited to the recognized English video menu after a trusted video click; do not alter unrelated/native menus or add permanent page buttons.
- Persist each capture with its origin/archive identity. Opening an old job must not silently switch it to the new default archive/server.
- No remotely hosted runtime scripts, styles, or font imports. Preserve bundled MIT/OFL notices in release artifacts.

## Verification and changes

- Run type checking and relevant suites before reporting a fix. Target/menu/message changes need unit plus browser checks; page/dialog/notification changes need `test:ui`. Packaging changes need `zip` and a source/dist/ZIP manifest comparison.
- `test` contains a production build. Build-dependent commands modify the same `dist`; run them sequentially, including tests in multiple agents.
- Browser fixtures do not prove live-site compatibility or native OS menu appearance. State what was actually tested; use disposable archives for paired-server smoke.
- There is no configured lint command. Do not invent checks or claim hosted CI ran before a push.
- Keep changes scoped and add meaningful regressions for behavior changes. Coordinate file ownership before parallel edits.
- Use `codex/` branches for agent work. Preserve unrelated local changes and all existing history. Publishing, releases and pushes follow the user’s requested scope.
- Never commit secrets, cookies, personal archives, generated profiles, ZIPs or `.env` files. See `.gitignore` and `SECURITY.md`.

## Pull requests

Explain the concrete behavior change, validation and material limitations. Mention permission/API/trust-boundary changes explicitly. Follow [Contributing](CONTRIBUTING.md) and use the PR template; do not copy conversational history into the description.
