# Release checklist

This repository has not published a release or browser-store listing. Version 0.1.4 is an unpacked development build; a GitHub source push does not install or update browser users automatically.

## Prepare

1. Confirm the intended shared frontend revision and CI pin. Install dependencies with `bun install --frozen-lockfile`.
2. Keep `manifest.json` and `package.json` versions equal, update the changelog, and review privacy/permissions and license notices.
3. Run sequentially:

   ```sh
   bun run typecheck
   bun run test:all
   bun run test:ui
   bun run zip
   ```

4. Perform the [manual checks](testing.md#manual-checks) with a disposable archive/current server. Record results and limitations; fixture checks are not live-site confirmation.
5. Validate source, `dist/manifest.json` and ZIP manifest JSON/version. Compare every ZIP file with `dist`, ensure no stale chunks, and confirm MIT/React notices plus four font files/two OFL notices are included. Exclude browser profiles, credentials, local archives and generated diagnostics from source history.

## Source repository

Keep a clean `main` branch and preserve development history. Configure `origin` for the repository. When the initial push is requested:

```sh
git push -u origin main
```

Then confirm the remote SHA/default branch and hosted CI result. CI has read-only repository permissions, pins dependency actions and the companion source, and uploads the controlled test previews and ZIP. No automatic release or browser-store publication is configured.

## Publish a release

Only after release publication is requested, tag the reviewed commit and attach the checked ZIP to a GitHub release with accurate notes. Users extract the ZIP and load its directory through `chrome://extensions`; existing users reload the extension and affected tabs. A store submission requires a separate packaging/policy review and is not part of the current workflow.

Keep generated ZIPs/previews out of Git. Preserve all bundled notices in every distributed artifact.
