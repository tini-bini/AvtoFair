# Release Handoff

## Release Artifact

- Package: `dist/AutoFair-chrome-extension-v1.0.0.zip`
- Manifest version: `3`
- Extension version: `1.0.0`
- Minimum Chrome version: `114`

## Chrome Web Store Upload Checklist

1. Run `python scripts\release_validate.py`
2. Run `python scripts\build.py`
3. Confirm `dist/AutoFair-chrome-extension-v1.0.0.zip` exists
4. Open the Chrome Web Store developer dashboard
5. Create or open the AutoFair listing
6. Upload the zip package
7. Provide the public privacy policy URL
8. Upload store graphics from `assets/`
9. Review permissions justification:
   - `storage`: settings, watchlist, sync status
   - `tabs`: opening dashboard and listing pages
   - `notifications`: price drop notifications
   - `alarms`: scheduled watchlist refresh
   - host permissions: Avto.net and mobile.de listing access
10. Verify the support CTA opens the configured PayPal.me link
11. Submit for review

## Store Assets Already Present

- `assets/logo-16.png`
- `assets/logo-32.png`
- `assets/logo-48.png`
- `assets/logo-128.png`
- `assets/promo-small-440x280.png`
- `assets/promo-marquee-1400x560.png`

## Manual Inputs Still Required

- Chrome Web Store developer account access
- Final store listing copy and category selections in the dashboard
- Public HTTPS privacy policy URL if GitHub Pages is not enabled
- Any store screenshots not already prepared in the repository

## Recommended Submission Notes

- Highlight supported marketplaces: Avto.net and mobile.de
- Highlight watchlist, price drops, seller trust hints, stale refresh, sync, and dashboard workflow
- Explain that the extension does not process payments and only opens a PayPal.me support link in a new browser tab
