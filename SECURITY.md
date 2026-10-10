# Security

## Supported builds

This project currently provides an unpacked development extension. Use the latest reviewed source/build; there is no browser-store release or long-term-support version yet. Browser and companion-server security updates remain important.

## Reporting a vulnerability

Contact [the repository owner](https://github.com/thegeneralist01) through a private channel for suspected credential exposure, sender/API boundary bypasses or unauthorized captures. If GitHub’s **Report a vulnerability** option is enabled under this repository’s Security tab, use it. Maintainers can coordinate fixes through a draft security advisory. Do not disclose an unpatched exploit or real credentials in a public issue.

Include the extension/browser versions, a minimal sanitized reproduction, expected/actual behavior, impact, and relevant file or API boundaries. Use disposable tokens and archives. Never attach session cookies, bearer tokens, credential files, browser profiles or private page content.

## Security model

The worker owns credentials and origin-bound API requests; content scripts receive only allowlisted capture capabilities. Chrome extension storage is limited to trusted extension contexts. Injected capture drafts use host-page session storage, which page scripts can read; this restriction does not cover that separate storage. Pairing occurs in the chosen server tab’s isolated world. Content targeting validates document freshness and ownership, and runtime assets are bundled locally.

[Architecture](docs/architecture.md) and [Privacy](PRIVACY.md) describe the boundaries and data flows. Unit/browser tests cover them, but fixture tests cannot guarantee compatibility with future website markup or a compromised browser profile.
