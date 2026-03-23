(function initScoring(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const { Constants, Utils } = root;

  function getScoreBand(score) {
    return Constants.SCORE_BANDS.find((band) => score >= band.min) || Constants.SCORE_BANDS[Constants.SCORE_BANDS.length - 1];
  }

  function buildPriceScore(deviationPercent, verdict) {
    if (deviationPercent === null || deviationPercent === undefined) {
      return null;
    }

    return Math.round(Utils.clamp(74 - deviationPercent * 4.2, 0, 100));
  }

  function buildMileageYearScore(listing) {
    if (!listing.year || !listing.mileage) {
      return 58;
    }

    const currentYear = new Date().getFullYear();
    const age = Math.max(1, currentYear - listing.year);
    const expectedMileage = age * 18000;
    const ratio = listing.mileage / expectedMileage;

    if (ratio <= 0.78) {
      return 90;
    }
    if (ratio <= 0.95) {
      return 82;
    }
    if (ratio <= 1.1) {
      return 74;
    }
    if (ratio <= 1.25) {
      return 62;
    }
    if (ratio <= 1.45) {
      return 48;
    }
    return 34;
  }

  function buildConfidenceScore(confidence, comparableCount, completeness) {
    const base = confidence === "high" ? 86 : confidence === "medium" ? 70 : 54;
    const countBonus = Math.min(comparableCount || 0, 20);
    const completenessBonus = Math.round((completeness || 0) * 8);
    return Math.round(Utils.clamp(base + Math.round(countBonus / 2) + completenessBonus, 0, 100));
  }

  function buildListingQualityScore(listing) {
    let score = 42;
    if (listing.imageUrl) {
      score += 10;
    }
    if (listing.sellerName) {
      score += 7;
    }
    if (listing.location) {
      score += 6;
    }
    if (listing.descriptionText && listing.descriptionText.length > 40) {
      score += 12;
    }
    if ((listing.equipmentHighlights || []).length >= 8) {
      score += 12;
    }
    score += Math.round((listing.completeness || 0) * 10);
    return Math.round(Utils.clamp(score, 0, 100));
  }

  function buildPriceContext(analysis) {
    if (analysis.deviationPercent === null || analysis.deviationPercent === undefined) {
      return "There is not enough market data yet for a clear price check.";
    }

    return `Price is ${Math.abs(Math.round(analysis.deviationPercent))}% ${analysis.deviationPercent <= 0 ? "below" : "above"} similar cars.`;
  }

  function buildExplanationBullets(listing, pricing, signals, subscores, listingQualityScore) {
    if (!listing.price) {
      return [
        "AvtoFair could not read the asking price clearly from this page yet.",
        "Try refreshing after the page fully loads."
      ];
    }

    if (pricing.verdict === "insufficient-data") {
      return [
        "There are not enough similar cars yet for a clear price check.",
        "You can still use Refresh after the page finishes loading."
      ];
    }

    const bullets = [];

    bullets.push(buildPriceContext(pricing));

    if (subscores.mileageYearScore >= 80) {
      bullets.push("Mileage looks good for the age of the car.");
    } else if (subscores.mileageYearScore <= 50) {
      bullets.push("Mileage looks high for the age of the car.");
    } else {
      bullets.push("Mileage looks normal for the age of the car.");
    }

    if (signals.equipmentSignals.length >= 3) {
      bullets.push("This car seems to have better equipment than many similar ads.");
    } else if (signals.equipmentSignals.length === 0) {
      bullets.push("Equipment looks basic, so price matters more here.");
    }

    if (signals.positiveSignals.length) {
      bullets.push(signals.positiveSignals[0].label);
    }

    if (signals.negativeSignals.length) {
      bullets.push(`${signals.negativeSignals[0].label} is a warning sign.`);
    }

    if (listingQualityScore >= 72) {
      bullets.push("The ad has good detail, which helps confidence.");
    } else if (listingQualityScore <= 48) {
      bullets.push("The ad is missing detail, so confidence is lower.");
    }

    return Utils.dedupeBy(bullets.filter(Boolean), (item) => Utils.normalizeLabel(item)).slice(0, 6);
  }

  function getScoreTone(score) {
    if (score >= 84) {
      return "strong";
    }
    if (score >= 66) {
      return "good";
    }
    if (score >= 48) {
      return "mixed";
    }
    return "weak";
  }

  function buildBreakdownSummary(key, score, listing, pricing, signals) {
    if (key === "price") {
      if (pricing.deviationPercent === null || pricing.deviationPercent === undefined) {
        return "Thin market sample limits the price read.";
      }
      return pricing.deviationPercent <= 0
        ? "Price sits below the comparable market."
        : "Price sits above the comparable market.";
    }

    if (key === "mileage") {
      if (!listing.year || !listing.mileage) {
        return "Missing year or mileage keeps this neutral.";
      }
      return score >= 75
        ? "Mileage looks healthy for the vehicle age."
        : score >= 55
          ? "Mileage is usable but not especially favorable."
          : "Mileage is heavy for the age of the car.";
    }

    if (key === "equipment") {
      return signals.equipmentSignals.length >= 3
        ? "Feature set adds clear buyer value."
        : signals.equipmentSignals.length >= 1
          ? "Some useful extras were detected."
          : "Few value-adding features were detected.";
    }

    if (key === "trust") {
      return signals.positiveSignals.length
        ? "Description quality and trust signals help."
        : "Sparse trust signals keep this from scoring higher.";
    }

    if (key === "risk") {
      return signals.negativeSignals.length
        ? "Risk phrases materially pulled the score down."
        : "No major textual risk flags were detected.";
    }

    return pricing.confidence === "high"
      ? "Comparable quality supports the estimate."
      : pricing.confidence === "medium"
        ? "Confidence is reasonable but not perfect."
        : "Confidence is limited by sample quality.";
  }

  function buildBreakdown(subscores, listing, pricing, signals) {
    const items = [
      {
        key: "price",
        label: "Price vs market",
        score: subscores.priceScore === null ? 50 : subscores.priceScore,
        weightPercent: 34
      },
      {
        key: "mileage",
        label: "Mileage / year",
        score: subscores.mileageYearScore,
        weightPercent: 14
      },
      {
        key: "equipment",
        label: "Equipment",
        score: subscores.equipmentScore,
        weightPercent: 16
      },
      {
        key: "trust",
        label: "Description / trust",
        score: subscores.descriptionTrustScore,
        weightPercent: 14
      },
      {
        key: "risk",
        label: "Risk profile",
        score: subscores.riskScore,
        weightPercent: 12
      },
      {
        key: "confidence",
        label: "Confidence",
        score: subscores.confidenceScore,
        weightPercent: 10
      }
    ];

    return items.map((item) => {
      return Object.assign({}, item, {
        tone: getScoreTone(item.score),
        summary: buildBreakdownSummary(item.key, item.score, listing, pricing, signals)
      });
    });
  }

  function buildScoreDrivers(listing, pricing, signals, subscores) {
    const positive = [];
    const negative = [];

    if (!listing.price) {
      negative.push("The asking price could not be read clearly from the page.");
      return {
        positive: positive,
        negative: negative
      };
    }

    if (pricing.verdict === "insufficient-data") {
      negative.push("There are not enough close comparable cars for a reliable price verdict.");
      return {
        positive: positive,
        negative: negative
      };
    }

    if (pricing.deviationPercent !== null && pricing.deviationPercent <= -5) {
      positive.push("Listing price looks better than the nearby market.");
    } else if (pricing.deviationPercent !== null && pricing.deviationPercent >= 5) {
      negative.push("Listing price is meaningfully above similar cars.");
    }

    if (subscores.mileageYearScore >= 80) {
      positive.push("Mileage is notably favorable for the age.");
    } else if (subscores.mileageYearScore <= 48) {
      negative.push("Mileage is heavy for the age of the car.");
    }

    if (signals.equipmentSignals.length >= 3) {
      positive.push("Equipment richness gives the listing extra value.");
    } else if (signals.equipmentSignals.length === 0) {
      negative.push("Few premium features were detected.");
    }

    if (signals.positiveSignals.length >= 2) {
      positive.push("The description contains several trust and maintenance clues.");
    } else if (signals.positiveSignals.length === 0) {
      negative.push("The description does not provide many trust-building details.");
    }

    if (signals.negativeSignals.length) {
      negative.push(`${signals.negativeSignals[0].label} is a meaningful caution signal.`);
    } else {
      positive.push("No major risk wording was found in the listing text.");
    }

    if (pricing.confidence === "high") {
      positive.push("Comparable quality supports a confident estimate.");
    } else if (pricing.confidence === "low") {
      negative.push("Comparable quality is weak, so the estimate carries more uncertainty.");
    }

    if (!listing.descriptionText || listing.descriptionText.length < 35) {
      negative.push("The listing description is short, which reduces transparency.");
    }

    return {
      positive: Utils.dedupeBy(positive, (item) => Utils.normalizeLabel(item)).slice(0, 5),
      negative: Utils.dedupeBy(negative, (item) => Utils.normalizeLabel(item)).slice(0, 5)
    };
  }

  function buildHeroLabel(pricing, scoreBandLabel) {
    if (pricing.verdict === "insufficient-data") {
      return "No clear read yet";
    }
    if (pricing.confidence === "low") {
      return `${scoreBandLabel} with caution`;
    }
    return scoreBandLabel;
  }

  function composeFinalAnalysis(listing, pricing, signals) {
    const priceScore = buildPriceScore(pricing.deviationPercent, pricing.verdict);
    const mileageYearScore = buildMileageYearScore(listing);
    const confidenceScore = buildConfidenceScore(pricing.confidence, pricing.comparableCount, listing.completeness);
    const listingQualityScore = buildListingQualityScore(listing);
    const descriptionTrustScore = Math.round(
      Utils.clamp((signals.trustScore + signals.descriptionQualityScore + listingQualityScore) / 3, 0, 100)
    );

    const subscores = {
      priceScore,
      mileageYearScore,
      equipmentScore: signals.equipmentScore,
      descriptionTrustScore,
      riskScore: signals.riskScore,
      confidenceScore
    };

    const hasReliablePriceRead = Boolean(listing.price && pricing.fairPrice && pricing.verdict !== "insufficient-data");
    const weightedScore = hasReliablePriceRead
      ? Math.round(
        subscores.priceScore * 0.34
        + subscores.mileageYearScore * 0.14
        + subscores.equipmentScore * 0.16
        + subscores.descriptionTrustScore * 0.14
        + subscores.riskScore * 0.12
        + subscores.confidenceScore * 0.10
      )
      : null;

    const dealScore = weightedScore === null ? null : Math.round(Utils.clamp(weightedScore, 0, 100));
    const band = dealScore === null
      ? { label: "No clear read yet" }
      : getScoreBand(dealScore);
    const explanationBullets = buildExplanationBullets(listing, pricing, signals, subscores, listingQualityScore);
    const breakdown = buildBreakdown(subscores, listing, pricing, signals);
    const drivers = buildScoreDrivers(listing, pricing, signals, subscores);
    const summary = explanationBullets[0]
      ? `${explanationBullets[0]} ${pricing.summary || ""}`.trim()
      : pricing.summary || "Not enough data yet.";

    return Object.assign({}, pricing, {
      dealScore,
      scoreBandLabel: band.label,
      heroLabel: buildHeroLabel(pricing, band.label),
      subscores,
      breakdown,
      drivers,
      equipmentScore: signals.equipmentScore,
      trustScore: signals.trustScore,
      descriptionQualityScore: signals.descriptionQualityScore,
      riskScore: signals.riskScore,
      positiveSignals: signals.positiveSignals,
      negativeSignals: signals.negativeSignals,
      equipmentSignals: signals.equipmentSignals,
      riskFlags: signals.riskFlags,
      explanationBullets,
      summary,
      signalSummary: {
        positiveCount: signals.positiveSignals.length,
        negativeCount: signals.negativeSignals.length,
        equipmentCount: signals.equipmentSignals.length
      }
    });
  }

  root.Scoring = {
    composeFinalAnalysis
  };
}(globalThis));
