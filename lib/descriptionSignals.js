(function initDescriptionSignals(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const { Utils } = root;

  const POSITIVE_SIGNALS = [
    { label: "Service history mentioned", patterns: [/servisna knjiga/i, /service history/i, /servisiran/i], weight: 12 },
    { label: "Regular maintenance mentioned", patterns: [/redno servisiran/i, /redno vzdrzevan/i, /major service/i], weight: 10 },
    { label: "Timing belt or chain work done", patterns: [/menjan jermen/i, /timing belt/i, /veriga menjana/i], weight: 9 },
    { label: "First owner signal", patterns: [/prvi lastnik/i, /1 lastnik/i, /first owner/i], weight: 8 },
    { label: "Garage kept", patterns: [/garaziran/i, /garaged/i], weight: 6 },
    { label: "Accident-free wording", patterns: [/ni bilo karambolirano/i, /accident free/i, /brez nesrece/i], weight: 8 },
    { label: "Warranty mentioned", patterns: [/garancija/i, /jamstvo/i, /warranty/i], weight: 8 },
    { label: "Registered and road-ready", patterns: [/registriran/i, /registracija/i], weight: 4 },
    { label: "New tires included", patterns: [/nove pnevmatike/i, /new tires/i, /zimske pnevmatike/i, /letne pnevmatike/i], weight: 5 },
    { label: "Recent brake or clutch work", patterns: [/nove zavore/i, /new brakes/i, /nova sklopka/i, /new clutch/i], weight: 6 },
    { label: "Slovenian origin", patterns: [/slovensko poreklo/i, /kupljen v slo/i], weight: 4 },
    { label: "Known maintenance records", patterns: [/racuni/i, /servisni racuni/i, /maintenance records/i], weight: 6 }
  ];

  const NEGATIVE_SIGNALS = [
    { label: "Damage mentioned", patterns: [/poskodovano/i, /damaged/i], weight: 18 },
    { label: "Accident history mentioned", patterns: [/karambolirano/i, /accident/i], weight: 20 },
    { label: "Needs investment", patterns: [/potrebno vlaganje/i, /needs investment/i, /za vlozit/i], weight: 18 },
    { label: "Engine issue signal", patterns: [/okvara motorja/i, /engine issue/i, /motor problem/i], weight: 24 },
    { label: "Gearbox issue signal", patterns: [/okvara menjalnika/i, /gearbox issue/i, /transmission issue/i], weight: 22 },
    { label: "Oil leak or fluid issue", patterns: [/pusca olje/i, /oil leak/i], weight: 18 },
    { label: "Urgent sale wording", patterns: [/nujno/i, /urgent sale/i, /hitro prodam/i], weight: 7 },
    { label: "Export-only wording", patterns: [/export/i], weight: 10 },
    { label: "Without warranty wording", patterns: [/brez garancije/i, /without warranty/i], weight: 7 },
    { label: "Without service history wording", patterns: [/brez servisne knjige/i, /without service history/i], weight: 12 },
    { label: "Not registered", patterns: [/ni registriran/i, /not registered/i], weight: 10 },
    { label: "Imported vehicle wording", patterns: [/uvozen/i, /uvoz/i, /imported/i], weight: 5 },
    { label: "Sold as seen wording", patterns: [/videno kupljeno/i, /sold as seen/i], weight: 14 },
    { label: "Hail or cosmetic damage", patterns: [/toca/i, /hail damage/i, /kozmeticne napake/i, /cosmetic defects/i], weight: 12 },
    { label: "Rust or corrosion signal", patterns: [/rja/i, /korozij/i, /rust/i, /corrosion/i], weight: 16 },
    { label: "Check engine or warning signal", patterns: [/check engine/i, /lucka/i, /opozorilna lucka/i], weight: 16 }
  ];

  const EQUIPMENT_SIGNALS = [
    { label: "Navigation", patterns: [/navigacij/i, /\bnavi\b/i, /navigation/i], weight: 5 },
    { label: "Leather seats", patterns: [/usnje/i, /leather seats/i], weight: 6 },
    { label: "Adaptive cruise control", patterns: [/adaptive cruise/i, /radarski tempomat/i], weight: 8 },
    { label: "LED or Matrix lights", patterns: [/\bled\b/i, /matrix/i, /xenon/i], weight: 6 },
    { label: "Panoramic roof", patterns: [/panorama/i, /panoramic roof/i], weight: 7 },
    { label: "Heated seats", patterns: [/gretje sedezev/i, /heated seats/i], weight: 5 },
    { label: "Camera", patterns: [/kamera/i, /rear camera/i], weight: 5 },
    { label: "Parking sensors", patterns: [/parkirni senzor/i, /parking sensors/i], weight: 4 },
    { label: "Automatic climate", patterns: [/avtomatska klima/i, /2 conska/i, /automatic climate/i], weight: 4 },
    { label: "AWD / 4x4", patterns: [/\b4x4\b/i, /\bawd\b/i, /4motion/i, /quattro/i, /xdrive/i], weight: 6 },
    { label: "Tow hook", patterns: [/vlecna kljuka/i, /tow hook/i], weight: 2 },
    { label: "Winter or summer wheels included", patterns: [/zimske pnevmatike/i, /letne pnevmatike/i, /winter tires/i, /summer tires/i], weight: 3 },
    { label: "Keyless entry/start", patterns: [/keyless/i, /brez kljuca/i], weight: 4 },
    { label: "CarPlay / Android Auto", patterns: [/carplay/i, /android auto/i], weight: 5 },
    { label: "Blind spot or lane assist", patterns: [/lane assist/i, /blind spot/i, /mrtvi kot/i, /ohranjanje voznega pasu/i], weight: 5 }
  ];

  function scanRules(text, rules) {
    const matches = [];

    for (const rule of rules) {
      const matchedPattern = rule.patterns.find((pattern) => pattern.test(text));
      if (matchedPattern) {
        matches.push({
          label: rule.label,
          weight: rule.weight,
          match: matchedPattern.source
        });
      }
    }

    return matches;
  }

  function summarizeBullets(priceContext, positiveSignals, negativeSignals, equipmentSignals, listing) {
    const bullets = [];

    if (priceContext) {
      bullets.push(priceContext);
    }

    if (equipmentSignals.length >= 3) {
      bullets.push("Rich equipment package improves the value case.");
    } else if (equipmentSignals.length === 0) {
      bullets.push("Equipment list looks basic, so value mostly depends on price and condition.");
    }

    if (positiveSignals.length) {
      bullets.push(positiveSignals[0].label);
    }

    if (negativeSignals.length) {
      bullets.push(`${negativeSignals[0].label} reduces trust.`);
    }

    if (listing.accidentFree === true) {
      bullets.push("The listing explicitly claims the car is accident-free.");
    }

    return Utils.dedupeBy(
      bullets.filter(Boolean),
      (item) => Utils.normalizeLabel(item)
    ).slice(0, 6);
  }

  function analyzeListingSignals(listing, priceContext) {
    const descriptionText = Utils.normalizeWhitespace(listing.descriptionText || "");
    const equipmentText = Utils.normalizeWhitespace(listing.equipmentText || "");
    const fullText = Utils.normalizeWhitespace(`${listing.title || ""} ${descriptionText} ${equipmentText} ${listing.textCorpus?.fullText || ""}`);
    const normalizedText = Utils.normalizeLabel(fullText);

    const positiveSignals = scanRules(normalizedText, POSITIVE_SIGNALS);
    const negativeSignals = scanRules(normalizedText, NEGATIVE_SIGNALS);
    const equipmentSignals = scanRules(normalizedText, EQUIPMENT_SIGNALS);

    if (listing.serviceHistory && !positiveSignals.some((item) => item.label === "Service history mentioned")) {
      positiveSignals.push({
        label: "Structured data suggests service history",
        weight: 10,
        match: "serviceHistory"
      });
    }

    if (listing.accidentFree === true && !positiveSignals.some((item) => item.label === "Accident-free wording")) {
      positiveSignals.push({
        label: "Structured data suggests accident-free history",
        weight: 8,
        match: "accidentFree"
      });
    }

    const descriptionLengthScore = Utils.clamp(Math.round(descriptionText.length / 18), 0, 16);
    const concreteSignalBonus = Utils.clamp(positiveSignals.length * 4 + equipmentSignals.length * 2, 0, 18);
    const equipmentScore = Utils.clamp(
      28 + equipmentSignals.reduce((sum, item) => sum + item.weight, 0) + Math.min((listing.equipmentHighlights || []).length, 10),
      0,
      100
    );
    const trustScore = Utils.clamp(
      44 + descriptionLengthScore + positiveSignals.reduce((sum, item) => sum + item.weight, 0) - negativeSignals.reduce((sum, item) => sum + Math.round(item.weight / 2), 0),
      0,
      100
    );
    const descriptionQualityScore = Utils.clamp(
      34 + descriptionLengthScore + concreteSignalBonus - Math.min(negativeSignals.length * 4, 16),
      0,
      100
    );
    const riskPenalty = negativeSignals.reduce((sum, item) => sum + item.weight, 0);
    const riskScore = Utils.clamp(
      88 - riskPenalty + Math.min(positiveSignals.length * 2, 10),
      0,
      100
    );

    return {
      positiveSignals,
      negativeSignals,
      equipmentSignals,
      equipmentScore,
      trustScore,
      descriptionQualityScore,
      riskScore,
      riskFlags: negativeSignals.map((item) => item.label),
      summaryBullets: summarizeBullets(priceContext, positiveSignals, negativeSignals, equipmentSignals, listing)
    };
  }

  root.DescriptionSignals = {
    analyzeListingSignals
  };
}(globalThis));
