# Contributing

Use issues for reproducible bugs and focused feature proposals. For security issues, follow [SECURITY.md](SECURITY.md). A report should name the extension and browser versions and include a sanitized reproduction; never include login cookies, tokens or archive contents.

## Development environment

Clone this repository beside [Archivr](https://github.com/thegeneralist01/archivr), then run:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
bunx playwright install chromium
bun run test:browser
bun run test:ui
```

CI uses Bun **1.3.14** and pins the shared source to the Archivr commit named in `.github/workflows/ci.yml`. To reproduce it locally, check out that commit in your companion checkout after preserving any local work. Update the pin deliberately with compatibility validation.

```sh
bun run dev  # rebuilds when extension/shared frontend source changes
bun run zip  # produces artifacts/archivr-extension.zip
```

Load `dist` unpacked in Chrome. A rebuild does not refresh an already loaded content script: reload the extension card and the affected tab. Do not run builds or build-dependent test commands concurrently; they write the same directory.

For another source location, set `ARCHIVR_SOURCE_DIR=/absolute/path/to/archivr/frontend/src` for build/dev commands. Type checking uses the sibling path configured in `tsconfig.json`, so keep that layout or deliberately update the compiler paths. Dependency edits must update `bun.lock` through Bun.

## Changes and review

Use TypeScript/React with plain CSS and the existing shared Archivr components. Preserve the UI’s paper palette, typefaces, controls and notification treatment. Avoid unrelated formatting changes. The [architecture guide](docs/architecture.md) identifies the credential and message boundaries; preserve them when adding features.

Before starting and before finishing a user-facing or API change, use Archivr's [ecosystem change checklist](https://github.com/thegeneralist01/archivr/blob/master/docs/ecosystem-change-checklist.md). Record whether Archivr and the MCP server need companion changes, with a reason for any project that is not applicable. The extension imports Archivr's Capture dialog, but its worker separately allowlists capture fields; check both when options change. Use the same review for direct commits and agent tasks, not only PRs.

Add meaningful regression coverage for changed routing, ownership, permissions, pairing, job lifecycle, or dialog state. For low-impact documentation edits, check links and commands rather than adding implementation-mirroring tests. Consult the [test guide](docs/testing.md) for the appropriate suites and their limits.

PRs should describe the problem, resulting behavior, verification and known limitations. Document permission, storage, API and compatibility changes. Update the changelog for user-visible behavior; keep manifest/package versions aligned when preparing a release.

Generated bundles, screenshots, browser profiles, ZIPs and secrets stay out of Git. Release builds retain [third-party notices](THIRD_PARTY_NOTICES.md). [AGENTS.md](AGENTS.md) provides the corresponding instructions for coding agents.
