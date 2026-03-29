from __future__ import annotations

import unittest

from js_harness import JsHarness


class PresentationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.js = JsHarness()
        self.js.load("lib/constants.js", "lib/i18n.js", "lib/utils.js", "lib/presentation.js")

    def test_watchlist_filter_and_sort(self) -> None:
        self.js.context.eval(
            """
            globalThis.__items = [
              {
                id: 'a',
                title: 'BMW 320d',
                currentPrice: 15000,
                analysis: { dealScore: 82, verdict: 'good-price' },
                history: { lastChecked: Date.now(), priceEvents: [], pricePoints: [{ timestamp: Date.now() - 1000, value: 15500 }, { timestamp: Date.now(), value: 15000 }] },
                meta: {}
              },
              {
                id: 'b',
                title: 'Audi A4',
                currentPrice: 18000,
                analysis: { dealScore: 55, verdict: 'slightly-overpriced' },
                history: { lastChecked: Date.now() - 86400000 * 5, priceEvents: [], pricePoints: [{ timestamp: Date.now() - 1000, value: 18000 }] },
                meta: {}
              }
            ];
            """
        )
        filtered = self.js.call("AvtoFair.Presentation.filterWatchlist(globalThis.__items, { query: 'bmw', filter: 'deals' })")
        self.assertEqual(len(filtered), 1)
        sorted_items = self.js.call("AvtoFair.Presentation.sortWatchlist(globalThis.__items, 'recommended')")
        self.assertEqual(sorted_items[0]["id"], "a")

    def test_duplicate_index_and_sparkline(self) -> None:
        self.js.context.eval(
            """
            globalThis.__dupes = [
              {
                id: '1',
                title: 'Golf',
                currentPrice: 12000,
                sellerName: 'Dealer',
                extracted: { make: 'VW', model: 'Golf', year: 2018, mileage: 90000 },
                history: { lastChecked: Date.now(), priceEvents: [], pricePoints: [{ timestamp: 1, value: 12500 }, { timestamp: 2, value: 12000 }] },
                analysis: { verdict: 'fair-price', dealScore: 66 },
                meta: {}
              },
              {
                id: '2',
                title: 'Golf other ad',
                currentPrice: 12100,
                sellerName: 'Dealer',
                extracted: { make: 'VW', model: 'Golf', year: 2018, mileage: 90500 },
                history: { lastChecked: Date.now(), priceEvents: [], pricePoints: [{ timestamp: 1, value: 12100 }] },
                analysis: { verdict: 'fair-price', dealScore: 61 },
                meta: {}
              }
            ];
            """
        )
        index = self.js.call("Object.fromEntries(AvtoFair.Presentation.buildDuplicateIndex(globalThis.__dupes))")
        self.assertEqual(index["1"], 2)
        spark = self.js.call("AvtoFair.Presentation.buildSparkline(AvtoFair.Presentation.getPriceSeries(globalThis.__dupes[0]), 100, 20)")
        self.assertTrue(spark["path"].startswith("M"))


if __name__ == "__main__":
    unittest.main()
