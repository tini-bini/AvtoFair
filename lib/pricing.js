(function initPricing(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const { Utils } = root;

  function yearAdjustment(subject, comparable) {
    if (!subject.year || !comparable.year) {
      return 1;
    }
    return 1 + Utils.clamp((subject.year - comparable.year) * 0.045, -0.18, 0.18);
  }

  function mileageAdjustment(subject, comparable) {
    if (!subject.mileage || !comparable.mileage) {
      return 1;
    }
    return 1 + Utils.clamp(((comparable.mileage - subject.mileage) / 10000) * 0.008, -0.16, 0.16);
  }

  function powerAdjustment(subject, comparable) {
    if (!subject.powerKw || !comparable.powerKw) {
      return 1;
    }
    return 1 + Utils.clamp(((subject.powerKw - comparable.powerKw) / 10) * 0.012, -0.1, 0.1);
  }

  function transmissionAdjustment(subject, comparable) {
    if (!subject.transmission || !comparable.transmission || subject.transmission === comparable.transmission) {
      return 1;
    }
    return subject.transmission === "automatic" ? 1.03 : 0.97;
  }

  function fuelAdjustment(subject, comparable) {
    if (!subject.fuel || !comparable.fuel || subject.fuel === comparable.fuel) {
      return 1;
    }
    return 0.98;
  }

  function bodyAdjustment(subject, comparable) {
    if (!subject.bodyType || !comparable.bodyType || subject.bodyType === comparable.bodyType) {
      return 1;
    }
    return 0.985;
  }

  function adjustComparablePrice(subject, comparable) {
    const factor = yearAdjustment(subject, comparable)
      * mileageAdjustment(subject, comparable)
      * powerAdjustment(subject, comparable)
      * transmissionAdjustment(subject, comparable)
      * fuelAdjustment(subject, comparable)
      * bodyAdjustment(subject, comparable);

    return comparable.price * factor;
  }

  function verdictFromDeviation(deviationPercent) {
    if (deviationPercent === null || deviationPercent === undefined) {
      return "insufficient-data";
    }
    if (deviationPercent <= -8) {
      return "great-deal";
    }
    if (deviationPercent < -3) {
      return "good-price";
    }
    if (deviationPercent <= 3) {
      return "fair-price";
    }
    if (deviationPercent < 8) {
      return "slightly-overpriced";
    }
    return "overpriced";
  }

  function computeConfidence(subject, comparables, adjustedPrices, fairPrice) {
    const count = comparables.length;
    const averageSimilarity = Utils.average(comparables.map((item) => item.similarityScore)) || 0;
    const completeness = subject.completeness || 0;
    const q1 = Utils.quantile(adjustedPrices, 0.25) || fairPrice || 1;
    const q3 = Utils.quantile(adjustedPrices, 0.75) || fairPrice || 1;
    const spreadRatio = fairPrice ? (q3 - q1) / fairPrice : 0.25;

    const countScore = count >= 18 ? 1 : count >= 10 ? 0.78 : count >= 6 ? 0.58 : count >= 3 ? 0.42 : 0.24;
    const similarityScore = averageSimilarity / 100;
    const consistencyScore = Utils.clamp(1 - spreadRatio, 0.15, 1);
    const combined = countScore * 0.38 + similarityScore * 0.3 + completeness * 0.17 + consistencyScore * 0.15;

    if (combined >= 0.77) {
      return {
        label: "high",
        marketSpreadPercent: Math.round(spreadRatio * 100)
      };
    }
    if (combined >= 0.56) {
      return {
        label: "medium",
        marketSpreadPercent: Math.round(spreadRatio * 100)
      };
    }
    return {
      label: "low",
      marketSpreadPercent: Math.round(spreadRatio * 100)
    };
  }

  function buildSummary(analysis) {
    if (analysis.verdict === "insufficient-data") {
      return "Not enough comparable listings were found to make a reliable estimate.";
    }

    if (analysis.comparableCount < 3) {
      return "This is a rough estimate based on a very small number of comparable listings.";
    }

    const marketSentence = `We found ${analysis.comparableCount} usable comparables and an estimated fair range around ${Math.abs(Math.round(analysis.deviationPercent))}% ${analysis.deviationPercent <= 0 ? "above the listing price" : "below the listing price"}.`;
    const confidenceSentence = analysis.confidence === "low"
      ? "Confidence is limited because the market sample is thin or inconsistent."
      : `Confidence is ${analysis.confidence} thanks to a reasonably close comparable set.`;

    return `${marketSentence} ${confidenceSentence}`;
  }

  function estimateBasePrice(subject) {
    const kw = subject.powerKw || 0;
    let base;
    if (kw >= 180) base = 38000;
    else if (kw >= 130) base = 26000;
    else if (kw >= 100) base = 19000;
    else if (kw >= 70) base = 13500;
    else if (kw >= 45) base = 9000;
    else base = 7500;

    if (subject.fuel === "electric") base = Math.round(base * 1.6);
    else if (subject.fuel === "hybrid") base = Math.round(base * 1.2);
    else if (subject.fuel === "diesel") base = Math.round(base * 0.96);

    if (subject.transmission === "automatic") base = Math.round(base * 1.04);
    return base;
  }

  function estimatePriceFromVehicleData(subject) {
    if (!subject.price || !subject.year) return null;

    const currentYear = new Date().getFullYear();
    const age = Math.max(0, currentYear - subject.year);
    if (age > 22) return null;

    let value = estimateBasePrice(subject);
    for (let i = 0; i < age; i++) {
      value *= i < 3 ? 0.85 : 0.90;
    }

    if (subject.mileage) {
      const expectedKm = Math.max(1, age) * 17000;
      const delta = subject.mileage - expectedKm;
      value *= 1 - Utils.clamp((delta / 10000) * 0.022, -0.18, 0.22);
    }

    const rounded = Math.round(value / 100) * 100;
    return (rounded >= 300 && rounded <= 250000) ? rounded : null;
  }

  function evaluatePricing(subject, comparableResult) {
    const comparables = comparableResult?.comparables || [];
    if (!subject?.price || comparables.length < 2) {
      const fallbackPrice = estimatePriceFromVehicleData(subject);
      const deviationPercent = (fallbackPrice && subject.price)
        ? Number((((subject.price - fallbackPrice) / fallbackPrice) * 100).toFixed(1))
        : null;
      const verdict = deviationPercent !== null ? verdictFromDeviation(deviationPercent) : "insufficient-data";
      const spread = fallbackPrice ? Math.round(fallbackPrice * 0.12) : 0;

      return {
        fairPrice: fallbackPrice,
        fairRangeMin: fallbackPrice ? Math.max(0, fallbackPrice - spread) : null,
        fairRangeMax: fallbackPrice ? fallbackPrice + spread : null,
        comparableMedianPrice: null,
        comparableAveragePrice: null,
        deviationPercent,
        comparableCount: comparables.length,
        confidence: "low",
        verdict: fallbackPrice ? verdict : "insufficient-data",
        isFallbackEstimate: Boolean(fallbackPrice),
        dealScore: null,
        summary: fallbackPrice
          ? "Estimate based on typical depreciation — no comparable listings found yet."
          : "Not enough data to estimate a fair price for this car.",
        adjustedComparables: [],
        marketSpreadPercent: null
      };
    }

    const adjustedComparables = comparables.map((comparable) => ({
      ...comparable,
      adjustedPrice: adjustComparablePrice(subject, comparable),
      weight: 0.4 + comparable.similarityScore / 100
    }));

    const adjustedPrices = adjustedComparables.map((item) => item.adjustedPrice);
    const fairPrice = Utils.weightedMedian(adjustedComparables, "adjustedPrice", "weight")
      || Utils.median(adjustedPrices);
    const q1 = Utils.quantile(adjustedPrices, 0.25) || fairPrice;
    const q3 = Utils.quantile(adjustedPrices, 0.75) || fairPrice;
    const spread = Math.max((q3 - q1) / 2, fairPrice * 0.03);
    const fairRangeMin = Math.round(Math.max(0, fairPrice - spread));
    const fairRangeMax = Math.round(fairPrice + spread);
    const deviationPercent = fairPrice ? ((subject.price - fairPrice) / fairPrice) * 100 : null;
    const confidenceResult = computeConfidence(subject, comparables, adjustedPrices, fairPrice);
    const verdict = verdictFromDeviation(deviationPercent);

    const analysis = {
      fairPrice: fairPrice ? Math.round(fairPrice) : null,
      fairRangeMin,
      fairRangeMax,
      comparableMedianPrice: Utils.median(comparables.map((item) => item.price)),
      comparableAveragePrice: comparables.length ? Math.round(Utils.average(comparables.map((item) => item.price))) : null,
      deviationPercent: deviationPercent !== null ? Number(deviationPercent.toFixed(1)) : null,
      comparableCount: comparables.length,
      confidence: confidenceResult.label,
      verdict,
      adjustedComparables,
      marketSpreadPercent: confidenceResult.marketSpreadPercent
    };

    analysis.summary = buildSummary(analysis);
    return analysis;
  }

  root.Pricing = {
    evaluatePricing,
    verdictFromDeviation
  };
}(globalThis));
