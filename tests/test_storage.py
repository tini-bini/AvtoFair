from __future__ import annotations

import json
import unittest

from js_harness import JsHarness


class StorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.js = JsHarness()
        self.js.load("lib/constants.js", "lib/utils.js", "lib/storage.js")

    def test_import_merge_and_export_backup(self) -> None:
        self.js.call_async("AvtoFair.Storage.ensureDefaults()")
        self.js.call_async(
            """AvtoFair.Storage.setWatchlist([{
                id: 'a',
                url: 'https://www.avto.net/Ads/details.asp?id=1',
                listingId: '1',
                title: 'BMW 320d',
                currentPrice: 15000,
                currency: 'EUR',
                history: { dateAdded: 1, lastChecked: 2, priceEvents: [], pricePoints: [{ timestamp: 2, value: 15000 }] },
                analysis: { verdict: 'good-price', dealScore: 80 }
            }])"""
        )
        backup = {
            "schemaVersion": 2,
            "exportedAt": 3,
            "settings": {"themeMode": "light", "cloudSyncEnabled": True},
            "watchlist": [
                {
                    "id": "b",
                    "url": "https://www.avto.net/Ads/details.asp?id=2",
                    "listingId": "2",
                    "title": "Audi A4",
                    "currentPrice": 18000,
                    "currency": "EUR",
                    "history": {"dateAdded": 3, "lastChecked": 4, "priceEvents": [], "pricePoints": [{"timestamp": 4, "value": 18000}]},
                    "analysis": {"verdict": "fair-price", "dealScore": 64}
                }
            ]
        }
        self.js.context.eval(f"globalThis.__backup = {json.dumps(backup)}")
        result = self.js.call_async("AvtoFair.Storage.importBackupData(globalThis.__backup, 'merge')")
        self.assertEqual(len(result["watchlist"]), 2)
        exported = self.js.call_async("AvtoFair.Storage.exportBackupData()")
        self.assertEqual(exported["schemaVersion"], 2)
        self.assertEqual(len(exported["watchlist"]), 2)

    def test_stale_detection(self) -> None:
        self.js.context.eval(
            """
            globalThis.__staleItem = {
              history: { lastChecked: Date.now() - (AvtoFair.Constants.STALE_REFRESH_AGE_MS + 1000) },
              meta: {}
            };
            """
        )
        is_stale = self.js.call("AvtoFair.Storage.isStaleWatchlistItem(globalThis.__staleItem)")
        self.assertTrue(is_stale)


if __name__ == "__main__":
    unittest.main()
