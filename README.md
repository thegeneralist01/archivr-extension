<img src="public/logo-mark.svg" width="56" height="56" alt="Archivr logo" />

# Archivr browser extension

Capture pages, X posts and threads, YouTube videos, and selected text to your own [Archivr](https://github.com/thegeneralist01/archivr) archive. Review each capture in Archivr’s familiar dialog, edit text before saving, and keep capture progress after closing the dialog.

**Chrome Manifest V3 · Chrome 123+ · Development version 0.1.4**

Firefox support and browser-store distribution are not implemented. Install an unpacked build for now.

## What it does

- **Pages:** right-click **Archive this page**, or use the toolbar popup.
- **X:** right-click a post for **Archive Tweet** or **Archive this thread**; right-click a video player for **Archive video**.
- **YouTube:** **Archive with Archivr** captures the clicked video or current target. Channels and playlists open a prefilled Archivr capture dialog for review.
- **Selected text:** right-click **Archive selected text**, then edit its title and body. Title generation is optional and manual.
- **Capture options:** the shared dialog includes media quality and the applicable Archivr advanced options.

No permanent Archive buttons crowd the page. Browser-native menus retain their normal appearance; X’s supported custom video menu gets a small branded action.

## Install

Requirements: Bun, Chrome 123+, a compatible self-hosted Archivr server, and an Archivr account with the User role. Building needs Archivr’s frontend source alongside this repository:

```sh
git clone https://github.com/thegeneralist01/archivr.git
git clone https://github.com/thegeneralist01/archivr-extension.git
cd archivr-extension
bun install --frozen-lockfile
bun run build
```

The directory layout should be:

```text
workspace/
  archivr/frontend/src/
  archivr-extension/
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked**, then select `archivr-extension/dist`.
3. In the welcome page, enter your server origin, such as `http://localhost:8080` or `https://archive.example.org`, and click **Connect**.
4. Log in in the server tab. Keep the welcome page open until pairing completes, then choose an archive if prompted.

The installed extension is self-contained; the source checkout and Bun are only needed to build it. After rebuilding, reload the extension card and refresh open X/YouTube tabs. To package a build, run `bun run zip` and extract `artifacts/archivr-extension.zip` before loading it unpacked.

## Connection and privacy

Pairing creates one API token named **Archivr Chrome extension** using your server’s existing login. The token stays in extension storage restricted to trusted contexts. Site cookies are not copied, content scripts cannot read the token, and capture requests go to the configured server and archive. There is no extension analytics service.

Disconnect from settings to revoke the token. [Privacy](PRIVACY.md) explains stored data, host permissions, capture requests, and local removal. [Security](SECURITY.md) covers vulnerability reporting.

## Documentation

- [Usage and troubleshooting](docs/usage.md)
- [Contributing and development setup](CONTRIBUTING.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Tests and manual verification](docs/testing.md)
- [Release checklist](docs/release.md)
- [Changelog](CHANGELOG.md)
- [Agent instructions](AGENTS.md)
- [Documentation index](docs/README.md)

## License

[MIT](LICENSE). Shared code, React, and the bundled fonts retain their notices; see [third-party notices](THIRD_PARTY_NOTICES.md).
