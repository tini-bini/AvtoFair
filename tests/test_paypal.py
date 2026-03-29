from __future__ import annotations

import unittest

from js_harness import JsHarness


class PayPalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.js = JsHarness()
        self.js.load("lib/constants.js", "lib/paypal.js")

    def test_support_url_is_valid_and_normalized(self) -> None:
        result = self.js.call("AvtoFair.PayPal.validatePayPalMeUrl(AvtoFair.Constants.SUPPORT_URL)")
        self.assertTrue(result["valid"])
        self.assertEqual(result["normalizedUrl"], "https://paypal.me/TiniFlegar")

    def test_prefilled_amount_link_generation(self) -> None:
        result = self.js.call("AvtoFair.PayPal.buildPayPalMeUrl('TiniFlegar', { amount: '5.50', currency: 'eur' })")
        self.assertEqual(result, "https://paypal.me/TiniFlegar/5.50EUR")

    def test_invalid_links_are_rejected(self) -> None:
        result = self.js.call("AvtoFair.PayPal.validatePayPalMeUrl('https://example.com/not-paypal')")
        self.assertFalse(result["valid"])


if __name__ == "__main__":
    unittest.main()
