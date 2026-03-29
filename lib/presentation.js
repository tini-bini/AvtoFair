(function initPresentation(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const { Constants, Utils } = root;
  const I18n = root.I18n;

  const VERDICT_LABEL_KEYS = {
    "great-deal": "greatDeal",
    "good-price": "goodPrice",
    "fair-price": "fairPrice",
    "slightly-overpriced": "slightlyOverpriced",
    "overpriced": "overpriced",
    "insufficient-data": "noResult"
  };

  const VERDICT_SHORT_KEYS = {
    "great-deal": "underMarket",
    "good-price": "belowMarket",
    "fair-price": "nearMarket",
    "slightly-overpriced": "aboveMarket",
    "overpriced": "wellAboveMarket",
    "insufficient-data": "checkingShort"
  };

  function t(key, vars) {
    return I18n ? I18n.t(key, vars) : key;
  }

  function normalizeTheme(theme) {
    return theme === "light" ? "light" : "dark";
  }

  function getVerdictMeta(verdict) {
    return Constants.VERDICTS[verdict] || Constants.VERDICTS["insufficient-data"];
  }

  function getVerdictLabel(verdict) {
    return t(VERDICT_LABEL_KEYS[verdict] || "noResult");
  }

  function getVerdictShortLabel(verdict) {
    return t(VERDICT_SHORT_KEYS[verdict] || "checkingShort");
  }

  function getConfidenceLabel(confidence, isFallbackEstimate) {
    if (isFallbackEstimate) {
      return t("depreciationEst");
    }
    if (confidence === "high") return t("highConfidence");
    if (confidence === "medium") return t("mediumConfidence");
    return t("lowConfidence");
  }

  function buildMainMessage(listing, analysis) {
    if (!listing?.price) {
      return t("mainMsgCannotReadPrice");
    }

    if (analysis?.marketBlockMessage && (analysis.deviationPercent === null || analysis.deviationPercent === undefined)) {
      return t("mainMsgMarketBlocked");
    }

    if (analysis?.deviationPercent === null || analysis?.deviationPercent === undefined) {
      return t("noResult");
    }

    const rounded = Math.abs(Math.round(analysis.deviationPercent));

    if (analysis.isFallbackEstimate) {
      return t("mainMsgFallback", {
        percent: rounded,
        direction: analysis.deviationPercent <= 0 ? t("below") : t("above")
      });
    }

    if (analysis.deviationPercent <= -8) {
      return t("mainMsgMuchCheaper", { percent: rounded });
    }

    if (analysis.deviationPercent < -3) {
      return t("mainMsgBitCheaper");
    }

    if (analysis.deviationPercent <= 3) {
      return t("mainMsgClose");
    }

    if (analysis.deviationPercent < 8) {
      return t("mainMsgBitMoreExpensive");
    }

    return t("mainMsgMuchMoreExpensive", { percent: rounded });
  }

  function buildDifferenceText(listing, analysis, locale) {
    if (!listing?.price || !analysis?.fairPrice) {
      return null;
    }

    const difference = listing.price - analysis.fairPrice;
    const prefix = analysis.isFallbackEstimate ? "~" : "";
    const absolute = Utils.formatPrice(Math.abs(difference), listing.currency, locale);

    if (Math.abs(difference) < 200) {
      return t("atMarketLevel");
    }

    if (difference < 0) {
      return `${prefix}${absolute} ${t("below")}`;
    }

    return `${prefix}${absolute} ${t("above")}`;
  }

  function buildReasonBullets(listing, analysis, limit) {
    const maxItems = Number.isFinite(limit) ? limit : 3;
    const bullets = [];

    if (!analysis) {
      return bullets;
    }

    if (analysis.marketBlockMessage) {
      bullets.push(analysis.marketBlockMessage);
      bullets.push(t("reasonTryRefresh"));
      return bullets.slice(0, maxItems);
    }

    if (analysis.positiveSignals?.length) {
      bullets.push(I18n ? I18n.translateSignalLabel(analysis.positiveSignals[0].label) : analysis.positiveSignals[0].label);
    }

    if (analysis.riskFlags?.length) {
      bullets.push(I18n ? I18n.translateSignalLabel(analysis.riskFlags[0]) : analysis.riskFlags[0]);
    }

    if (analysis.comparableCount) {
      bullets.push(`${analysis.comparableCount} ${t("comparables").toLowerCase()}`);
    }

    if (!bullets.length && listing) {
      bullets.push(buildMainMessage(listing, analysis));
    }

    return bullets.slice(0, maxItems);
  }

  function getLatestPriceEvent(item) {
    const events = Array.isArray(item?.history?.priceEvents) ? item.history.priceEvents : [];
    return events[events.length - 1] || null;
  }

  function getPriceDropAmount(item) {
    const event = getLatestPriceEvent(item);
    if (!event || event.type !== "drop") {
      return null;
    }
    if (typeof event.oldPrice !== "number" || typeof event.newPrice !== "number") {
      return null;
    }
    return Math.max(0, event.oldPrice - event.newPrice);
  }

  function hasAttentionFlag(item) {
    const verdict = item?.analysis?.verdict;
    if (verdict === "slightly-overpriced" || verdict === "overpriced") {
      return true;
    }
    return Boolean(item?.meta?.lastError);
  }

  function isStaleItem(item, thresholdMs) {
    const ageThreshold = Number.isFinite(thresholdMs) ? thresholdMs : Constants.STALE_REFRESH_AGE_MS;
    const lastChecked = item?.history?.lastChecked || 0;
    return !lastChecked
      || (Date.now() - lastChecked) >= ageThreshold
      || Boolean(item?.meta?.lastError);
  }

  function getListingShape(item) {
    return Object.assign({}, item?.extracted || {}, item || {});
  }

  function getSellerTrustMeta(item, analysisOverride) {
    const listing = getListingShape(item);
    const analysis = analysisOverride || item?.analysis || {};
    let score = 48;

    if (listing.sellerType === "dealer") score += 8;
    if (listing.sellerName) score += 10;
    if (listing.location) score += 6;
    if (listing.descriptionText && listing.descriptionText.length > 80) score += 8;
    if (listing.serviceHistory || analysis.positiveSignals?.length) score += 8;
    if ((listing.equipmentHighlights || []).length >= 8) score += 4;
    if (analysis.riskFlags?.length) score -= Math.min(analysis.riskFlags.length * 6, 18);
    if (!listing.sellerName) score -= 6;
    if (item?.meta?.lastError) score -= 8;

    score = Math.round(Utils.clamp(score, 18, 96));

    if (score >= 78) {
      return { score, label: t("sellerTrustStrong"), tone: "good" };
    }
    if (score >= 62) {
      return { score, label: t("sellerTrustGood"), tone: "good" };
    }
    if (score >= 48) {
      return { score, label: t("sellerTrustMixed"), tone: "neutral" };
    }
    return { score, label: t("sellerTrustLow"), tone: "danger" };
  }

  function buildDuplicateSignature(item) {
    const listing = getListingShape(item);
    const make = Utils.normalizeLabel(listing.make || "");
    const model = Utils.normalizeLabel(listing.model || "");
    const year = listing.year || "";
    const mileageBucket = listing.mileage ? Math.round(listing.mileage / 2500) : "";
    const seller = Utils.normalizeLabel(item?.sellerName || "");
    const priceBucket = item?.currentPrice ? Math.round(item.currentPrice / 500) : "";

    if (!make || !model || !year) {
      return null;
    }

    return [make, model, year, mileageBucket, seller, priceBucket].join("|");
  }

  function buildDuplicateIndex(items) {
    const signatures = new Map();
    const output = new Map();

    for (const item of (items || [])) {
      const signature = buildDuplicateSignature(item);
      if (!signature) {
        continue;
      }
      const group = signatures.get(signature) || [];
      group.push(item.id);
      signatures.set(signature, group);
    }

    signatures.forEach((group) => {
      if (group.length < 2) {
        return;
      }
      group.forEach((id) => output.set(id, group.length));
    });

    return output;
  }

  function getPriceSeries(item) {
    const raw = Array.isArray(item?.history?.pricePoints) ? item.history.pricePoints : [];
    if (!raw.length && typeof item?.currentPrice === "number") {
      return [{
        timestamp: item?.history?.lastChecked || item?.history?.dateAdded || Date.now(),
        value: item.currentPrice
      }];
    }
    return raw
      .filter((point) => point && typeof point.value === "number")
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(-24);
  }

  function buildSparkline(points, width, height) {
    const series = Array.isArray(points) ? points : [];
    if (!series.length) {
      return {
        path: "",
        min: null,
        max: null,
        latest: null
      };
    }

    if (series.length === 1) {
      return {
        path: `M0 ${Math.round(height / 2)} L${width} ${Math.round(height / 2)}`,
        min: series[0].value,
        max: series[0].value,
        latest: series[0].value
      };
    }

    const values = series.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const stepX = width / Math.max(series.length - 1, 1);
    const path = series.map((point, index) => {
      const x = Math.round(index * stepX * 100) / 100;
      const y = Math.round((height - ((point.value - min) / range) * height) * 100) / 100;
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    }).join(" ");

    return {
      path,
      min,
      max,
      latest: values[values.length - 1]
    };
  }

  function getWatchlistInsights(items) {
    const list = Array.isArray(items) ? items : [];
    const scores = list
      .map((item) => item?.analysis?.dealScore)
      .filter((score) => typeof score === "number");

    return {
      total: list.length,
      goodDeals: list.filter((item) => {
        const verdict = item?.analysis?.verdict;
        return verdict === "great-deal" || verdict === "good-price";
      }).length,
      priceDrops: list.filter((item) => getLatestPriceEvent(item)?.type === "drop").length,
      attention: list.filter(hasAttentionFlag).length,
      averageScore: scores.length ? Math.round(Utils.average(scores)) : null
    };
  }

  function getSearchableText(item) {
    const parts = [
      item?.title,
      item?.sellerName,
      item?.location,
      item?.extracted?.make,
      item?.extracted?.model,
      item?.extracted?.trimVersion,
      item?.extracted?.fuel,
      item?.extracted?.transmission
    ];
    return parts.filter(Boolean).join(" ").toLowerCase();
  }

  function matchesQuery(item, query) {
    const normalized = Utils.normalizeWhitespace(query).toLowerCase();
    if (!normalized) {
      return true;
    }
    return getSearchableText(item).includes(normalized);
  }

  function matchesFilter(item, filter) {
    switch (filter) {
      case "deals":
        return item?.analysis?.verdict === "great-deal" || item?.analysis?.verdict === "good-price";
      case "drops":
        return getLatestPriceEvent(item)?.type === "drop";
      case "attention":
        return hasAttentionFlag(item);
      default:
        return true;
    }
  }

  function filterWatchlist(items, filters) {
    const list = Array.isArray(items) ? items : [];
    const query = filters?.query || "";
    const filter = filters?.filter || "all";

    return list.filter((item) => matchesQuery(item, query) && matchesFilter(item, filter));
  }

  function getRecommendationScore(item) {
    const score = typeof item?.analysis?.dealScore === "number" ? item.analysis.dealScore : 0;
    const dropBonus = getLatestPriceEvent(item)?.type === "drop" ? 6 : 0;
    const attentionPenalty = hasAttentionFlag(item) ? 8 : 0;
    const freshnessBonus = item?.history?.lastChecked ? Math.max(0, 4 - Math.floor((Date.now() - item.history.lastChecked) / 86400000)) : 0;
    return score + dropBonus + freshnessBonus - attentionPenalty;
  }

  function getRiskWeight(item) {
    const verdict = item?.analysis?.verdict;
    if (verdict === "overpriced") return 3;
    if (verdict === "slightly-overpriced") return 2;
    if (item?.meta?.lastError) return 1;
    return 0;
  }

  function getSortValue(item, sortBy) {
    if (sortBy === "score-desc") {
      return typeof item?.analysis?.dealScore === "number" ? item.analysis.dealScore : -1;
    }
    if (sortBy === "recent-check") {
      return item?.history?.lastChecked || 0;
    }
    if (sortBy === "biggest-drop") {
      return getPriceDropAmount(item) || 0;
    }
    if (sortBy === "highest-risk") {
      return getRiskWeight(item) * 1000 + Math.max(0, 100 - (item?.analysis?.dealScore || 0));
    }
    return getRecommendationScore(item);
  }

  function sortWatchlist(items, sortBy) {
    const list = Array.isArray(items) ? items.slice() : [];
    return list.sort((left, right) => {
      const primary = getSortValue(right, sortBy) - getSortValue(left, sortBy);
      if (primary !== 0) {
        return primary;
      }

      const leftChecked = left?.history?.lastChecked || 0;
      const rightChecked = right?.history?.lastChecked || 0;
      if (rightChecked !== leftChecked) {
        return rightChecked - leftChecked;
      }

      return (left?.title || "").localeCompare(right?.title || "");
    });
  }

  function formatCheckedAt(timestamp, locale) {
    if (!timestamp) {
      return t("notCheckedYet");
    }
    return Utils.formatDateTime(timestamp, locale);
  }

  root.Presentation = {
    normalizeTheme,
    getVerdictMeta,
    getVerdictLabel,
    getVerdictShortLabel,
    getConfidenceLabel,
    buildMainMessage,
    buildDifferenceText,
    buildReasonBullets,
    getLatestPriceEvent,
    getPriceDropAmount,
    getWatchlistInsights,
    filterWatchlist,
    sortWatchlist,
    formatCheckedAt,
    hasAttentionFlag,
    isStaleItem,
    getSellerTrustMeta,
    buildDuplicateIndex,
    getPriceSeries,
    buildSparkline
  };
}(globalThis));
