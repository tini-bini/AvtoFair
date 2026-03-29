# Manual QA

## Supported Browsers

- Chrome 114+

## Core User Journeys

### Listing Analysis

1. Load the unpacked extension in Chrome.
2. Open an Avto.net listing page.
3. Confirm the floating panel appears.
4. Confirm a verdict, deal score, pricing summary, and updated timestamp render.
5. Use `Alt+Shift+A` to trigger analysis if needed.

### Save and Watchlist

1. Open the extension popup on a supported listing.
2. Confirm the current listing card renders.
3. Click `Save to watchlist`.
4. Confirm the item appears in the watchlist with chips, score, and actions.
5. Click the listing `Open` action and confirm a new tab opens.

### Refresh and Sync

1. Save at least two listings.
2. Use `Refresh stale` and confirm only stale items are refreshed.
3. Enable `Cloud sync`.
4. Click `Sync now`.
5. Confirm sync status updates and no error banner appears.

### Import and Export

1. Click `Export`.
2. Confirm a JSON backup downloads.
3. Click `Import` and re-import the backup.
4. Confirm watchlist data remains intact and deduplicated.

## PayPal.me Verification

### Automated Verification Already Covered

- Link formatting normalization
- Invalid link rejection
- Prefilled amount URL generation
- Reachability redirect check to `paypal.com/paypalme/...`

### Manual Verification Still Required

1. Open the popup and click `Support AutoFair`.
2. Confirm a new tab opens to `https://paypal.me/TiniFlegar` or its PayPal redirect target.
3. Repeat on desktop and, if relevant, Chrome on Android with the extension surface available.
4. Temporarily replace `SUPPORT_URL` with an invalid URL and confirm the support CTA becomes disabled.
5. If future product flows generate amount-prefilled links, confirm the amount and optional currency suffix render correctly in the opened PayPal URL.

No live payment completion is asserted by this repository.
