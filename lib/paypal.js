(function initPayPal(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};

  function safeUrl(input) {
    const candidate = String(input || "").trim();
    if (!candidate) {
      return null;
    }

    try {
      return new URL(candidate);
    } catch (error) {
      const match = candidate.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i);
      if (!match) {
        return null;
      }

      return {
        hostname: match[1],
        pathname: match[2] || "/"
      };
    }
  }

  function normalizeAmount(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const numeric = String(value).trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(numeric)) {
      return null;
    }

    const parsed = Number.parseFloat(numeric);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2).replace(/\.00$/, "");
  }

  function normalizeCurrency(value) {
    if (!value) {
      return null;
    }
    const candidate = String(value).trim().toUpperCase();
    return /^[A-Z]{3}$/.test(candidate) ? candidate : null;
  }

  function extractHandleAndAmount(url) {
    if (!url) {
      return null;
    }

    const host = String(url.hostname || "").toLowerCase();
    const pathSegments = url.pathname.split("/").filter(Boolean);
    let username = null;
    let amountSegment = null;

    if (host === "paypal.me" || host === "www.paypal.me") {
      username = pathSegments[0] || null;
      amountSegment = pathSegments[1] || null;
    } else if (host === "paypal.com" || host === "www.paypal.com") {
      if (pathSegments[0] !== "paypalme") {
        return null;
      }
      username = pathSegments[1] || null;
      amountSegment = pathSegments[2] || null;
    }

    if (!username || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(username)) {
      return null;
    }

    if (!amountSegment) {
      return {
        username,
        amount: null,
        currency: null
      };
    }

    const amountMatch = String(amountSegment).trim().match(/^(\d+(?:[.,]\d{1,2})?)([A-Za-z]{3})?$/);
    if (!amountMatch) {
      return null;
    }

    const amount = normalizeAmount(amountMatch[1]);
    const currency = normalizeCurrency(amountMatch[2] || null);

    if (!amount) {
      return null;
    }

    return {
      username,
      amount,
      currency
    };
  }

  function normalizePayPalMeUrl(input) {
    const parsed = safeUrl(input);
    const extracted = extractHandleAndAmount(parsed);

    if (!extracted) {
      return null;
    }

    const base = `https://paypal.me/${extracted.username}`;

    if (!extracted.amount) {
      return base;
    }

    return `${base}/${extracted.amount}${extracted.currency || ""}`;
  }

  function buildPayPalMeUrl(usernameOrUrl, options) {
    const config = options || {};
    const extractedInput = extractHandleAndAmount(safeUrl(usernameOrUrl));
    const username = extractedInput ? extractedInput.username : usernameOrUrl;

    const handle = String(username || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(handle)) {
      return null;
    }

    const amount = normalizeAmount(config.amount);
    const currency = normalizeCurrency(config.currency);
    const base = `https://paypal.me/${handle}`;

    if (!amount) {
      return base;
    }

    return `${base}/${amount}${currency || ""}`;
  }

  function validatePayPalMeUrl(input) {
    const normalized = normalizePayPalMeUrl(input);
    if (!normalized) {
      return {
        valid: false,
        normalizedUrl: null,
        username: null,
        amount: null,
        currency: null,
        reason: "invalid-paypalme-url"
      };
    }

    const extracted = extractHandleAndAmount(safeUrl(normalized));
    return {
      valid: true,
      normalizedUrl: normalized,
      username: extracted ? extracted.username : null,
      amount: extracted ? extracted.amount : null,
      currency: extracted ? extracted.currency : null,
      reason: null
    };
  }

  function getSupportConfig(url) {
    const result = validatePayPalMeUrl(url);
    return {
      valid: result.valid,
      url: result.normalizedUrl,
      reason: result.reason,
      label: result.valid ? result.username : null
    };
  }

  root.PayPal = {
    buildPayPalMeUrl,
    normalizePayPalMeUrl,
    validatePayPalMeUrl,
    getSupportConfig
  };
}(globalThis));
