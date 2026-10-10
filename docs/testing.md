# Testing and verification

Run from the extension root with the sibling shared frontend checkout installed as described in [Contributing](../CONTRIBUTING.md).

| Command | Coverage |
| --- | --- |
| `bun run typecheck` | Strict TypeScript for extension source; needs the default sibling checkout |
| `bun run test` | Unit tests; includes a real production build, so do not run alongside another build |
| `bun run test:browser` | Builds `dist`, then exercises trusted X custom-menu events in Chromium |
| `bun run test:ui` | Builds `dist`, records UI fixtures, then loads the real extension in a disposable Chromium profile |
| `bun run test:all` | Unit and X browser suites; run `test:ui` separately |
| `bun run zip` | Builds and packages the unpacked extension without stale ZIP members |

Install the browser binary first with `bunx playwright install chromium`. On Linux, `bunx playwright install --with-deps chromium` also installs system dependencies. Tests do not pair with your personal server automatically.

## Automated browser checks

`test:browser` exercises trusted right-clicks, delayed menus, quoted video ownership, keyboard activation, stale/detached players, SPA navigation, rerender restoration, and cleanup. It uses controlled X markup, not a live X account.

Browser tests use one Chromium process with a fresh context per fixture, so DOM, storage, routes and menu timers remain isolated without repeatedly opening browser control pipes. Tests have a 30-second overall budget; fixture setup/execution and context cleanup each have a 10-second deadline. Ordinary Playwright locator/wait operations have a 5-second deadline, while explicit short menu/navigation assertions keep their original deadlines. Unexpected browser disconnects fail immediately, and combined fixture/cleanup failures retain both errors. For control-pipe diagnostics, run `DEBUG=pw:api,pw:browser bun run test:browser` against these controlled fixtures.

`test:ui` renders production bundles with a mocked extension bridge. It checks onboarding, pairing, settings, popup, narrow and long-content layouts, editable capture text, advanced options, notifications, and batch/repeated/warning capture feedback. It compares computed shared-dialog styles and checks page errors and horizontal overflow. The packaged-extension smoke separately uses the real worker/content APIs, tab navigation and activation, and local font rendering under `font-src 'none'`.

Screenshots and a JSON report are written to `artifacts/ui/`; all generated output is ignored by Git. These checks do not visually inspect native OS menu painting or confirm future live-site DOM compatibility. CI runs the same suites and uploads the ZIP and controlled fixture screenshots.

## Manual checks

Use a disposable archive and a current server:

1. Load `dist` unpacked. Enter a host with a port; reject a path or embedded credentials. Confirm the host permission request and server tab.
2. Log in to an account without the User role: pairing must refuse capture. Log in to a User account: exactly one extension token should appear. Reload the onboarding tab during polling and verify it does not mint another token.
3. Choose a non-default archive on a multi-archive server. Capture a normal page. Check the capture in that archive and verify popup status updates.
4. Select multiline Unicode text. Confirm the first nonempty line becomes the title and that body editing and manual title generation work. Capture without AI generation too.
5. On X, right-click timeline/notification posts, thread replies, detail/quoted posts, action rows, timestamps, and exact status links. Test both native X and OldTwitter layouts. Right-click an actual video and verify **Archive video** opens `x:media:ID`; on X’s custom video menu, confirm exactly one temporary **Archive video** action appears beside video-specific commands and uses the quoted owner when applicable. Repeat on a poster image/avatar and ensure this option is absent. Verify **Archive Tweet** uses the intended tweet and **Archive this thread** uses the same ID as a thread; after a post click, right-click the feed background and confirm it does not reuse the stale post.
6. On YouTube, right-click a video on a channel or playlist page. Capture the clicked video only. Test a playlist/channel link, Shorts, and a `youtu.be` URL. Containers must open the prefilled server dialog without submitting.
7. Start a capture, close the popup/dialog, then stop/restart the service worker from `chrome://extensions`. Verify the alarm resumes polling and the job settles.
8. Revoke the extension token in Archivr and verify capture fails clearly; Disconnect should clear the revoked connection. Test offline Disconnect’s local-forget recovery separately.
9. Test a `chrome://` page and the Web Store: the fallback capture tab should appear with a helpful message.
10. Inspect content-script messages/storage: settings/token access must be denied, unknown API methods rejected, and all capture requests pinned to the selected archive/server.

## Release validation

Follow the [release checklist](release.md). Historical evidence lives in [verification.md](verification.md); it records checks at the time of each change, rather than claiming current test results.
