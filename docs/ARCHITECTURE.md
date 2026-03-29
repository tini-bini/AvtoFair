# Architecture

## Overview

AutoFair is a Chrome Manifest V3 extension with a deliberately small runtime surface:

- The content layer extracts listing data and reacts to page changes on supported sites.
- The injected panel presents pricing verdicts and quick actions inside the listing page.
- The popup/dashboard provides a richer watchlist, settings, sync, import/export, and support workflows.
- The service worker owns storage-backed workflows, alarms, refresh jobs, sync, and cross-context messaging.

## Module Boundaries

### UI Layer

- `panel.js`
  - Renders the in-page floating panel
  - Binds keyboard shortcuts for listing actions
  - Handles user feedback, state transitions, and support CTA behavior
- `script.js`
  - Renders the popup and expanded dashboard
  - Owns watchlist filtering, sorting, exporting, importing, syncing, and settings controls

### Domain and Presentation Layer

- `lib/presentation.js`
  - Shared verdict labels, summaries, chips, sparkline data shaping, duplicate detection, seller trust hints, stale detection
- `lib/scoring.js`
  - Deal score and verdict logic
- `lib/pricing.js`
  - Fair price estimation logic
- `lib/comparables.js`
  - Comparable listing search and summarization
- `lib/descriptionSignals.js`
  - Description-based heuristics

### Data and Infrastructure Layer

- `lib/storage.js`
  - Watchlist persistence
  - Backup export/import
  - Sync payload shaping
  - Staleness checks and history retention
- `lib/paypal.js`
  - PayPal.me normalization, validation, and prefilled amount URL generation
- `lib/i18n.js`
  - Copy system and localization strings
- `lib/utils.js`
  - Formatting and shared helper utilities
- `lib/parsing.js`, `lib/selectors.js`
  - Site-specific extraction support

### Background Orchestration

- `service-worker.js`
  - Runtime message routing
  - Settings retrieval and updates
  - Watchlist save/remove/refresh flows
  - Cloud sync execution and status persistence
  - Alarm-driven refresh scheduling
  - Dashboard tab opening

## Reliability Strategy

- Keep parsing and rendering separated so UI failures do not corrupt persisted data.
- Persist normalized watchlist records with bounded history to avoid unbounded growth.
- Guard all async operations with explicit status handling in the popup and panel.
- Validate PayPal.me links before rendering actionable support CTAs.
- Prefer derived presentation helpers over duplicating formatting logic in multiple surfaces.

## Release Gate

- `scripts/lint.py`: repository hygiene and placeholder detection
- `scripts/typecheck.py`: manifest checks, JavaScript syntax checks, popup DOM contract checks
- `scripts/test.py`: unit and integration-style tests for critical flows
- `scripts/build.py`: Chrome Web Store zip packaging
- `scripts/release_validate.py`: full release gate including live PayPal redirect verification
