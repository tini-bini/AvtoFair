# AutoFair

AutoFair is a production-ready Chrome extension that helps used-car buyers evaluate listings on Avto.net and mobile.de before they commit. It combines on-page analysis, comparable pricing signals, a persistent watchlist, optional Chrome sync backup, and a polished dashboard/panel experience tuned for daily use.

## Product Summary

- Product type: Chrome extension (Manifest V3)
- Target users: shoppers comparing used-car listings on Avto.net and mobile.de
- Primary flows:
  1. Open a supported listing and get an instant pricing verdict
  2. Save listings to a watchlist and track price movement over time
  3. Refresh, filter, export, import, sync, and review saved opportunities from the popup dashboard
- Runtime target: Chrome Web Store release

## Architecture

- `content.js`: page lifecycle orchestration, extraction entrypoints, messaging with the floating panel
- `panel.js`: injected UI on supported listing pages
- `script.js`: popup and dashboard application shell
- `service-worker.js`: background message routing, persistence workflows, refresh jobs, alarms, dashboard opening, sync
- `lib/`: reusable modules for parsing, pricing, scoring, presentation, storage, PayPal link safety, i18n, utilities
- `styles.css` and `styles/panel.css`: popup/dashboard and in-page panel styling
- `scripts/`: repository validation, packaging, and release checks
- `tests/`: critical-path automated tests for PayPal, storage, and presentation behavior

More detail is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository Layout

```text
assets/                  Icons and Chrome Web Store promo assets
lib/                     Shared business logic and infrastructure modules
scripts/                 Lint, validation, build, and release scripts
styles/                  Shared style assets for injected UI
tests/                   Automated tests for critical flows
content.js               Content script orchestration
panel.js                 Floating panel UI
popup.html               Popup and dashboard shell
script.js                Popup and dashboard logic
service-worker.js        MV3 background service worker
privacy-policy.html      Privacy policy for store submission
```

## Requirements

- Python 3.11 or newer
- Google Chrome 114 or newer

## Setup

1. Create a virtual environment if you want isolated tooling.
2. Install development dependencies:

```powershell
python -m pip install -r requirements-dev.txt
```

3. Run the release gate:

```powershell
python scripts\release_validate.py
```

4. Load the extension locally:
   - Open `chrome://extensions`
   - Enable Developer mode
   - Click `Load unpacked`
   - Select the repository root

## Available Commands

```powershell
python scripts\lint.py
python scripts\typecheck.py
python scripts\test.py
python scripts\build.py
python scripts\release_validate.py
```

## Environment Variables

This extension currently requires no environment variables for local development, packaging, or Chrome Web Store upload. The tracked example file is [`.env.example`](.env.example).

## PayPal Support Link

- Support CTA source: `lib/constants.js`
- Current configured link: `https://paypal.me/TiniFlegar`
- Validation and normalization logic: `lib/paypal.js`
- Automated coverage:
  - valid support URL normalization
  - amount-prefilled PayPal.me URL generation
  - invalid link rejection

Live payment completion is not simulated in this repository because no PayPal checkout credentials or account-side payment instrumentation are present. The link behavior is validated to the maximum extent available in the local and scripted environment. Manual verification steps are documented in [docs/MANUAL-QA.md](docs/MANUAL-QA.md).

## Build Artifact

The packaging script creates:

- `dist/AutoFair-chrome-extension-v1.0.0.zip`

That zip is the artifact intended for manual Chrome Web Store upload.

## Release Process

1. Run `python scripts\release_validate.py`
2. Confirm the extension loads in Chrome
3. Verify the manual QA checklist in [docs/MANUAL-QA.md](docs/MANUAL-QA.md)
4. Package with `python scripts\build.py`
5. Upload the zip to the Chrome Web Store dashboard
6. Complete the store listing and privacy policy fields

The full release and store handoff checklist is in [docs/RELEASE-HANDOFF.md](docs/RELEASE-HANDOFF.md).

## Privacy Policy

- Local file: `privacy-policy.html`
- Expected public URL if GitHub Pages is enabled:
  - `https://tini-bini.github.io/AvtoFair/privacy-policy.html`

If GitHub Pages is not enabled, host this file at another public HTTPS URL before submitting the extension.
