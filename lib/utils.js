(function initUtils(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function toTextLines(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .split(/\r?\n+/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeLabel(value) {
    return normalizeWhitespace(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseInteger(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const digits = String(value).replace(/[^\d-]/g, "");
    if (!digits) {
      return null;
    }

    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parsePrice(value) {
    if (!value) {
      return null;
    }

    const text = normalizeWhitespace(value);
    const moneyMatch = text.match(/(?:€|eur)\s*([\d\s.'’,]+)|([\d\s.'’,]+)\s*(?:€|eur)/i);
    const candidate = moneyMatch
      ? (moneyMatch[1] || moneyMatch[2] || "")
      : (text.match(/\d{1,3}(?:[.\s'’]\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/) || [])[0];

    if (!candidate) {
      return null;
    }

    let normalized = String(candidate)
      .replace(/\u00a0/g, "")
      .replace(/\s+/g, "")
      .replace(/[’']/g, "");

    const commaIndex = normalized.lastIndexOf(",");
    const dotIndex = normalized.lastIndexOf(".");

    if (commaIndex >= 0 && dotIndex >= 0) {
      if (commaIndex > dotIndex) {
        normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
      } else {
        normalized = normalized.replace(/,/g, "");
      }
    } else if (commaIndex >= 0) {
      const decimalDigits = normalized.length - commaIndex - 1;
      normalized = decimalDigits > 0 && decimalDigits <= 2
        ? normalized.replace(/\./g, "").replace(/,/g, ".")
        : normalized.replace(/,/g, "");
    } else {
      const dotParts = normalized.split(".");
      if (dotParts.length > 2) {
        normalized = dotParts.join("");
      } else if (dotParts.length === 2 && dotParts[1].length === 3) {
        normalized = dotParts.join("");
      }
    }

    normalized = normalized.replace(/[^\d.]/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    const rounded = Math.round(parsed);
    if (rounded < 100 || rounded > 2000000) {
      return null;
    }

    return rounded;
  }

  function formatPrice(value, currency, locale) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "N/A";
    }

    try {
      return new Intl.NumberFormat(locale || "sl-SI", {
        style: "currency",
        currency: currency || "EUR",
        maximumFractionDigits: 0
      }).format(value);
    } catch (error) {
      return `${Math.round(value).toLocaleString("sl-SI")} ${currency || "EUR"}`;
    }
  }

  function formatNumber(value, locale) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "N/A";
    }

    return Number(value).toLocaleString(locale || "sl-SI");
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "N/A";
    }

    const rounded = Math.abs(value) < 10 ? value.toFixed(1) : Math.round(value);
    return `${rounded > 0 ? "+" : ""}${rounded}%`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function average(values) {
    const filtered = (values || []).filter((item) => typeof item === "number" && !Number.isNaN(item));
    if (!filtered.length) {
      return null;
    }

    return filtered.reduce((sum, item) => sum + item, 0) / filtered.length;
  }

  function quantile(values, q) {
    const filtered = (values || [])
      .filter((item) => typeof item === "number" && !Number.isNaN(item))
      .sort((left, right) => left - right);

    if (!filtered.length) {
      return null;
    }

    if (filtered.length === 1) {
      return filtered[0];
    }

    const position = (filtered.length - 1) * clamp(q, 0, 1);
    const base = Math.floor(position);
    const rest = position - base;
    const next = filtered[base + 1];

    if (next === undefined) {
      return filtered[base];
    }

    return filtered[base] + rest * (next - filtered[base]);
  }

  function median(values) {
    return quantile(values, 0.5);
  }

  function weightedMedian(items, valueKey, weightKey) {
    const prepared = (items || [])
      .filter((item) => item && typeof item[valueKey] === "number" && typeof item[weightKey] === "number")
      .sort((left, right) => left[valueKey] - right[valueKey]);

    if (!prepared.length) {
      return null;
    }

    const totalWeight = prepared.reduce((sum, item) => sum + item[weightKey], 0);
    let running = 0;

    for (const item of prepared) {
      running += item[weightKey];
      if (running >= totalWeight / 2) {
        return item[valueKey];
      }
    }

    return prepared[prepared.length - 1][valueKey];
  }

  function dedupeBy(items, getKey) {
    const seen = new Set();
    return (items || []).filter((item) => {
      const key = getKey(item);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  function slugify(value) {
    return normalizeLabel(value).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function extractListingIdFromUrl(url) {
    if (!url) {
      return null;
    }

    try {
      const origin = globalScope.location && globalScope.location.origin
        ? globalScope.location.origin
        : "https://www.avto.net";
      const parsed = new URL(url, origin);
      return parsed.searchParams.get("id") || parsed.searchParams.get("ID");
    } catch (error) {
      const match = String(url).match(/[?&](?:id|ID)=([^&#]+)/);
      return match ? match[1] : null;
    }
  }

  function makeAbsoluteUrl(url) {
    if (!url) {
      return null;
    }

    try {
      return new URL(url, "https://www.avto.net").toString();
    } catch (error) {
      return null;
    }
  }

  function safeLower(value) {
    return normalizeWhitespace(value).toLowerCase();
  }

  function pickLongest(values) {
    const filtered = (values || []).filter(Boolean).map(normalizeWhitespace);
    if (!filtered.length) {
      return null;
    }

    return filtered.sort((left, right) => right.length - left.length)[0];
  }

  function trimHash(url) {
    if (!url) {
      return null;
    }

    return String(url).replace(/#.*$/, "");
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      globalScope.setTimeout(resolve, ms);
    });
  }

  function formatDateTime(timestamp, locale) {
    if (!timestamp) {
      return "N/A";
    }

    try {
      return new Intl.DateTimeFormat(locale || "sl-SI", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(timestamp));
    } catch (error) {
      return new Date(timestamp).toLocaleString();
    }
  }

  function debug(tag, message, data) {
    const isDev = globalScope.location?.hostname === "localhost" || globalScope.location?.hostname === "127.0.0.1";
    if (isDev || globalScope.AvtoFairDebug) {
      const prefix = `[AvtoFair:${tag}]`;
      if (data !== undefined) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  }

  root.Utils = {
    normalizeWhitespace,
    normalizeLabel,
    parseInteger,
    parsePrice,
    formatPrice,
    formatNumber,
    formatPercent,
    clamp,
    average,
    median,
    quantile,
    weightedMedian,
    dedupeBy,
    slugify,
    extractListingIdFromUrl,
    makeAbsoluteUrl,
    safeLower,
    pickLongest,
    trimHash,
    sleep,
    toTextLines,
    escapeHtml,
    formatDateTime,
    debug
  };
}(globalThis));
