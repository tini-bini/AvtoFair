(function initParsing(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const { Utils, Selectors, Constants } = root;

  function isAvtoNetPage(url) {
    try {
      const parsed = new URL(url || globalScope.location?.href || "");
      return /(^|\.)avto\.net$/i.test(parsed.hostname);
    } catch (error) {
      return false;
    }
  }

  function isMobileDePage(url) {
    try {
      const parsed = new URL(url || globalScope.location?.href || "");
      return /(^|\.)mobile\.de$/i.test(parsed.hostname);
    } catch (error) {
      return false;
    }
  }

  function isListingPage(url, doc) {
    const pageUrl = url || doc?.location?.href || "";
    if (isMobileDePage(pageUrl)) {
      return Selectors.mobileDe.listingUrlPattern.test(pageUrl);
    }
    return Selectors.listingUrlPattern.test(pageUrl);
  }

  function isResultsPage(url) {
    const pageUrl = url || "";
    if (isMobileDePage(pageUrl)) {
      return Selectors.mobileDe.resultsUrlPattern.test(pageUrl);
    }
    return Selectors.resultsUrlPattern.test(pageUrl);
  }

  function isIgnoredNode(node) {
    return Boolean(node?.closest?.(Selectors.avtoFairRootSelector));
  }

  function getSanitizedText(doc) {
    if (!doc?.body) {
      return "";
    }

    const clone = doc.body.cloneNode(true);
    clone.querySelectorAll(Selectors.avtoFairRootSelector).forEach((node) => node.remove());
    clone.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
    return clone.innerText || clone.textContent || "";
  }

  function extractTextLines(doc) {
    return Utils.toTextLines(getSanitizedText(doc));
  }

  function isIgnoredLine(line) {
    const raw = Utils.normalizeWhitespace(line);
    const normalized = Utils.normalizeLabel(line);
    return Selectors.ignoredTextPatterns.some((pattern) => pattern.test(raw) || pattern.test(normalized));
  }

  function collectLabelMap(doc) {
    const labelMap = new Map();

    const write = (label, value) => {
      const normalizedLabel = Utils.normalizeLabel(label);
      const normalizedValue = Utils.normalizeWhitespace(value);

      if (!normalizedLabel || !normalizedValue) {
        return;
      }

      if (!labelMap.has(normalizedLabel) || normalizedValue.length > labelMap.get(normalizedLabel).length) {
        labelMap.set(normalizedLabel, normalizedValue);
      }
    };

    doc.querySelectorAll("table tr").forEach((row) => {
      if (isIgnoredNode(row)) {
        return;
      }

      const cells = row.querySelectorAll("th, td");
      if (cells.length >= 2) {
        write(cells[0].textContent, cells[1].textContent);
      }
    });

    doc.querySelectorAll("dt").forEach((term) => {
      if (isIgnoredNode(term)) {
        return;
      }

      write(term.textContent, term.nextElementSibling?.textContent || "");
    });

    doc.querySelectorAll("p, div, li, span").forEach((node) => {
      if (isIgnoredNode(node)) {
        return;
      }

      const text = Utils.normalizeWhitespace(node.textContent);
      if (!text || text.length > 160) {
        return;
      }

      const separatorMatch = text.match(/^([^:]{2,60}):\s*(.+)$/);
      if (separatorMatch) {
        write(separatorMatch[1], separatorMatch[2]);
      }
    });

    return labelMap;
  }

  function getAliasValue(labelMap, aliasKey) {
    const aliases = Selectors.labelAliases[aliasKey] || [];
    for (const alias of aliases) {
      const value = labelMap.get(Utils.normalizeLabel(alias));
      if (value) {
        return value;
      }
    }

    return null;
  }

  function findFirstPrice(lines) {
    const stopWords = /podobne cene|najnovejsi oglasi|ostali oglasi/i;
    const prepared = (lines || [])
      .filter((line) => /(?:\u20AC|eur)/i.test(line))
      .filter((line) => !stopWords.test(Utils.normalizeLabel(line)))
      .map((line) => ({
        line,
        price: Utils.parsePrice(line),
        normalized: Utils.normalizeLabel(line)
      }))
      .filter((item) => item.price !== null)
      .sort((left, right) => {
        const leftPenalty = /km|kw|lastnik|gorivo|menjalnik/.test(left.normalized) ? 1 : 0;
        const rightPenalty = /km|kw|lastnik|gorivo|menjalnik/.test(right.normalized) ? 1 : 0;

        if (leftPenalty !== rightPenalty) {
          return leftPenalty - rightPenalty;
        }

        return left.line.length - right.line.length;
      });

    return prepared.length ? prepared[0].line : null;
  }

  function findHeadingTitle(doc) {
    for (const selector of Selectors.titleSelectors) {
      const candidates = Array.from(doc.querySelectorAll(selector)).filter((element) => !isIgnoredNode(element));
      const element = candidates[0];
      if (!element) {
        continue;
      }

      const content = element.getAttribute?.("content") || element.textContent;
      const normalized = Utils.normalizeWhitespace(content);
      if (normalized && normalized.length > 10) {
        return normalized.replace(/\s*-\s*prodam.*$/i, "");
      }
    }

    const title = Utils.normalizeWhitespace(doc.title);
    return title ? title.replace(/\s*-\s*prodam.*$/i, "") : null;
  }

  function extractMakeModelFromLinks(doc, fallbackTitle) {
    const link = Array.from(doc.querySelectorAll(Selectors.listingLinkSelector))
      .filter((anchor) => !isIgnoredNode(anchor))
      .find((anchor) => /znamka=/i.test(anchor.href));

    if (link) {
      try {
        const parsed = new URL(link.href, "https://www.avto.net");
        const make = Utils.normalizeWhitespace(parsed.searchParams.get("znamka"));
        const model = Utils.normalizeWhitespace(parsed.searchParams.get("model"));
        if (make || model) {
          return {
            make: make || null,
            model: model || null
          };
        }
      } catch (error) {
        // Ignore malformed links and fall back to title heuristics.
      }
    }

    const title = Utils.normalizeWhitespace(fallbackTitle);
    if (!title) {
      return {
        make: null,
        model: null
      };
    }

    const parts = title.split(" ");
    const make = parts[0] || null;
    const trimTokens = new Set([
      "tdi",
      "tsi",
      "dci",
      "hdi",
      "gdi",
      "ecoboost",
      "ecoblue",
      "hybrid",
      "mhev",
      "phev",
      "edition",
      "comfortline",
      "trendline",
      "highline",
      "titanium",
      "trend",
      "business",
      "style",
      "active",
      "limited",
      "exclusive",
      "elegance",
      "executive",
      "stline",
      "st",
      "line",
      "rsline",
      "amgline",
      "msport",
      "xline",
      "sportline",
      "sport",
      "sline",
      "gtline",
      "laureinklement",
      "xdrive",
      "quattro"
    ]);
    const modelTokens = [];

    function normalizeTokenForTrim(token) {
      return Utils.normalizeLabel(token).replace(/\s+/g, "");
    }

    function looksLikeSpecToken(token) {
      const raw = Utils.normalizeWhitespace(token);
      const normalized = normalizeTokenForTrim(token);

      if (!raw) {
        return false;
      }

      if (trimTokens.has(normalized)) {
        return true;
      }

      if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
        return true;
      }

      if (/^\d+(?:[.,]\d+)?(?:tdi|tsi|dci|hdi|gdi|ecoboost|ecoblue|tfsi|cdi|jtd|multijet)$/i.test(raw)) {
        return true;
      }

      if (/^(?:diesel|petrol|bencin|benzin|hybrid|electric|elektro|avtomatik|automatic|manual|awd|4x4)$/i.test(raw)) {
        return true;
      }

      if (/[/.]/.test(raw) && /\d/.test(raw)) {
        return true;
      }

      if (/[/.]/.test(raw) && raw.length > 4) {
        return true;
      }

      return false;
    }

    for (const token of parts.slice(1)) {
      if (looksLikeSpecToken(token)) {
        break;
      }

      modelTokens.push(token);
      if (modelTokens.length >= 3) {
        break;
      }
    }

    return {
      make: make ? make.replace(/[^\p{L}\d-]+/gu, "") : null,
      model: modelTokens.length ? modelTokens.join(" ") : null
    };
  }

  function inferTrimVersion(title, make, model) {
    const normalizedTitle = Utils.normalizeWhitespace(title);
    if (!normalizedTitle) {
      return null;
    }

    const prefix = [make, model].filter(Boolean).join(" ");
    if (prefix && normalizedTitle.toLowerCase().startsWith(prefix.toLowerCase())) {
      const remainder = Utils.normalizeWhitespace(normalizedTitle.slice(prefix.length));
      return remainder || null;
    }

    return null;
  }

  function parsePowerInfo(value) {
    const text = Utils.normalizeWhitespace(value);
    if (!text) {
      return {
        powerKw: null,
        powerHp: null,
        engineSizeCcm: null
      };
    }

    const kwMatch = text.match(/(\d{2,4})\s*kW/i);
    const hpMatch = text.match(/(\d{2,4})\s*KM/i);
    const ccmMatch = text.match(/(\d{3,5})\s*ccm/i);

    return {
      powerKw: kwMatch ? Utils.parseInteger(kwMatch[1]) : null,
      powerHp: hpMatch ? Utils.parseInteger(hpMatch[1]) : null,
      engineSizeCcm: ccmMatch ? Utils.parseInteger(ccmMatch[1]) : null
    };
  }

  function normalizeFuel(value) {
    const text = Utils.normalizeLabel(value);
    if (!text) {
      return null;
    }

    if (text.includes("diesel")) {
      return "diesel";
    }
    if (text.includes("bencin") || text.includes("benzin") || text.includes("benzin")) {
      return "petrol";
    }
    if (text.includes("elektr")) {
      return "electric";
    }
    if (text.includes("hibrid") || text.includes("hybrid")) {
      return "hybrid";
    }
    if (text.includes("plin") || text.includes("lpg") || text.includes("cng") || text.includes("erdgas") || text.includes("autogas")) {
      return "gas";
    }

    return Utils.normalizeWhitespace(value);
  }

  function normalizeTransmission(value) {
    const text = Utils.normalizeLabel(value);
    if (!text) {
      return null;
    }

    if (text.includes("avtomat") || text.includes("automatik") || text.includes("automatic")) {
      return "automatic";
    }
    if (text.includes("rocni") || text.includes("schalt") || text.includes("manuell") || text.includes("manual")) {
      return "manual";
    }

    return Utils.normalizeWhitespace(value);
  }

  function getAliasValueFromMap(labelMap, aliases) {
    for (const alias of (aliases || [])) {
      const value = labelMap.get(Utils.normalizeLabel(alias));
      if (value) return value;
    }
    return null;
  }

  function extractMakeModelFromMobileDe(doc, labelMap, title) {
    // Try to extract make/model from breadcrumb or similar car links
    const link = Array.from(doc.querySelectorAll(Selectors.mobileDe.makeIdLinkSelector))
      .find((anchor) => !isIgnoredNode(anchor));

    if (link) {
      try {
        const parsed = new URL(link.href, "https://suchen.mobile.de");
        const makeId = parsed.searchParams.get("makeModelVariant1.makeId");
        // Store makeId on the link for later use by comparables
        if (makeId) {
          const modelId = parsed.searchParams.get("makeModelVariant1.modelId") || null;
          return { makeId, modelId };
        }
      } catch (error) {
        // ignore
      }
    }
    return { makeId: null, modelId: null };
  }

  function parseMobileDeAvailability(pageText) {
    const normalized = Utils.normalizeLabel(pageText);
    return !Selectors.mobileDe.listingRemovalPhrases.some((phrase) => normalized.includes(Utils.normalizeLabel(phrase)));
  }

  function parseMobileDeYear(value) {
    if (!value) return null;
    // "11/2019" or "2019" format
    const match = String(value).match(/(\d{4})/);
    return match ? Utils.parseInteger(match[1]) : null;
  }

  function inferSellerType(doc, lines) {
    const pageText = Utils.normalizeLabel(getSanitizedText(doc));
    if (/trgovec|vsi oglasi trgovca|salon/.test(pageText)) {
      return "dealer";
    }

    if ((lines || []).some((line) => /registrirani uporabnik avto\.net/i.test(line))) {
      return "private";
    }

    return null;
  }

  function findSellerName(doc, lines) {
    const sellers = Array.from(doc.querySelectorAll("strong, h3, h4, h5"))
      .filter((node) => !isIgnoredNode(node))
      .map((node) => Utils.normalizeWhitespace(node.textContent))
      .filter((value) => value && !/prodajalec|telefon|cena|dodatne moznosti/i.test(Utils.normalizeLabel(value)));

    const sellerFromHeadings = sellers.find((value) => /avto|motors|cars|trade|auto/i.test(value));
    if (sellerFromHeadings) {
      return sellerFromHeadings;
    }

    const lineIndex = (lines || []).findIndex((line) => /^prodajalec$/i.test(Utils.normalizeLabel(line)));
    if (lineIndex >= 0) {
      const candidate = lines[lineIndex + 1];
      if (candidate && !/telefon|e-mail|email/i.test(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  function findPrimaryImage(doc) {
    const ogImage = doc.querySelector("meta[property='og:image']");
    if (ogImage?.content) {
      return Utils.makeAbsoluteUrl(ogImage.content);
    }

    const image = Array.from(doc.querySelectorAll("img[src*='images.avto.net/photo']"))
      .filter((img) => !isIgnoredNode(img))
      .map((img) => img.getAttribute("src"))
      .filter(Boolean)
      .map((src) => src.replace(/_small(?=\.)/i, ""))[0];

    return image ? Utils.makeAbsoluteUrl(image) : null;
  }

  function findSectionRange(lines, startMatchers, stopMatchers) {
    let startIndex = -1;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (startMatchers.some((pattern) => pattern.test(Utils.normalizeLabel(line)))) {
        startIndex = index;
        break;
      }
    }

    if (startIndex < 0) {
      return null;
    }

    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (stopMatchers.some((pattern) => pattern.test(Utils.normalizeLabel(line)))) {
        endIndex = index;
        break;
      }
    }

    return {
      startIndex,
      endIndex
    };
  }

  function extractEquipmentHighlights(lines) {
    const sectionRange = findSectionRange(
      lines,
      Selectors.equipmentSectionTitles.map((title) => new RegExp(`^${Utils.normalizeLabel(title)}$`, "i")),
      Selectors.descriptionStopTitles.map((title) => new RegExp(`^${Utils.normalizeLabel(title)}$`, "i"))
    );

    const equipmentLines = sectionRange
      ? lines.slice(sectionRange.startIndex + 1, Math.min(sectionRange.endIndex, sectionRange.startIndex + 70))
      : [];

    const highlights = equipmentLines
      .flatMap((line) => line.split(/[*\u2022]/g))
      .flatMap((line) => line.split(/\s{2,}/g))
      .map((line) => Utils.normalizeWhitespace(line))
      .filter((line) => line && line.length > 3 && line.length < 80)
      .filter((line) => !/^(podvozje|varnost|notranjost|udobje|multimedia|uporabnost|stanje):?$/i.test(Utils.normalizeLabel(line)))
      .filter((line) => !isIgnoredLine(line));

    return Utils.dedupeBy(highlights, (item) => Utils.normalizeLabel(item)).slice(0, 30);
  }

  function extractNarrativeLines(lines) {
    const lowerLines = lines.map((line) => Utils.normalizeLabel(line));
    const startIndex = Math.max(
      lowerLines.lastIndexOf("stanje"),
      lowerLines.lastIndexOf("stanje:")
    );

    if (startIndex < 0) {
      return [];
    }

    const narrative = [];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      const normalized = Utils.normalizeLabel(line);
      if (!line) {
        continue;
      }

      if (Selectors.descriptionStopTitles.some((title) => normalized === Utils.normalizeLabel(title))) {
        break;
      }

      if (/^\d[\d.\s]*\s*(?:\u20AC|eur)$/i.test(line) || /^prodajalec$/i.test(normalized) || /^telefon:?$/i.test(normalized)) {
        break;
      }

      if (isIgnoredLine(line)) {
        continue;
      }

      if (/^(podvozje|varnost|notranjost|udobje|multimedia|uporabnost|stanje):?$/i.test(normalized)) {
        continue;
      }

      narrative.push(line);
    }

    return narrative;
  }

  function extractDescriptionText(lines, title, priceText, location) {
    const candidateNarrative = extractNarrativeLines(lines);
    const baseCandidates = candidateNarrative.length ? candidateNarrative : lines;

    const candidates = baseCandidates
      .map((line) => Utils.normalizeWhitespace(line))
      .filter((line) => line.length >= 8 && line.length <= 180)
      .filter((line) => !isIgnoredLine(line))
      .filter((line) => line !== title)
      .filter((line) => line !== priceText)
      .filter((line) => line !== location)
      .filter((line) => !/^(prva registracija|prevozenih|lastnikov|vrsta goriva|moc motorja|menjalnik|osnovni podatki|zgodovina vozila|poraba goriva|oprema|prodajalec|cena|telefon|rubrike)/i.test(Utils.normalizeLabel(line)))
      .filter((line) => !/^\d[\d.\s]*\s*(km|\u20AC|eur)$/i.test(line))
      .filter((line) => !/^\d{4}(\/\d+)?$/.test(line))
      .filter((line) => /[a-z]/i.test(Utils.normalizeLabel(line)))
      .filter((line) => line.split(" ").length >= 2);

    const unique = Utils.dedupeBy(candidates, (item) => Utils.normalizeLabel(item));
    return unique.slice(0, 12).join(" ").trim();
  }

  function inferAccidentFree(textSource) {
    const normalized = Utils.normalizeLabel(textSource);
    if (normalized.includes("vozilo ni bilo karambolirano") || normalized.includes("accident free")) {
      return true;
    }
    if (normalized.includes("karambolirano") || normalized.includes("poskodovano")) {
      return false;
    }
    return null;
  }

  function inferServiceHistory(textSource) {
    return Utils.normalizeLabel(textSource).includes("servisna knjiga");
  }

  function inferAvailability(textSource, url) {
    const pageText = Utils.normalizeLabel(textSource);
    if (isMobileDePage(url)) {
      return parseMobileDeAvailability(textSource);
    }
    return !Selectors.listingRemovalPhrases.some((phrase) => pageText.includes(Utils.normalizeLabel(phrase)));
  }

  function buildContentFingerprint(doc, url) {
    const lines = extractTextLines(doc).slice(0, 70);
    const markerLines = lines.filter((line) => /(registracija|gorivo|menjalnik|prevozenih|lastnikov)/i.test(Utils.normalizeLabel(line)));

    return [
      Utils.trimHash(url || doc.location?.href || ""),
      findHeadingTitle(doc) || "",
      findFirstPrice(lines) || "",
      markerLines.join("|")
    ].join("||");
  }

  function parseListingDocument(doc, sourceUrl) {
    const url = sourceUrl || doc.location?.href || "";
    const pageText = getSanitizedText(doc);
    const lines = extractTextLines(doc);
    const labelMap = collectLabelMap(doc);
    const available = inferAvailability(pageText, url);
    const isMobileDe = isMobileDePage(url);
    const site = isMobileDe ? Constants.SITES.MOBILEDE : Constants.SITES.AVTONET;

    if (!isAvtoNetPage(url) && !isMobileDe) {
      return {
        supported: false,
        isListingPage: false,
        available: false,
        reason: "unsupported-site",
        summary: "Open an Avto.net or mobile.de car listing to analyze the price."
      };
    }

    if (!isListingPage(url, doc)) {
      return {
        supported: true,
        isListingPage: false,
        available: false,
        reason: isResultsPage(url) ? "results-page" : "unsupported-page",
        summary: isMobileDe
          ? "Open a mobile.de car listing to analyze the price."
          : "Open an Avto.net car listing to analyze the price."
      };
    }

    if (!available) {
      return {
        supported: true,
        isListingPage: true,
        available: false,
        reason: "listing-unavailable",
        summary: "This listing appears unavailable or has already been removed."
      };
    }

    const title = findHeadingTitle(doc);
    const firstPriceLine = findFirstPrice(lines);

    // Use site-specific label aliases when available
    const getField = isMobileDe
      ? (key) => getAliasValueFromMap(labelMap, Selectors.mobileDe.labelAliases[key])
      : (key) => getAliasValue(labelMap, key);

    const priceText = getField("price") || firstPriceLine;
    const price = Utils.parsePrice(priceText);
    const currency = /(?:\u20AC|eur)/i.test(priceText || "") ? "EUR" : Constants.CURRENCY;

    let makeModel, mobileDeIds;
    if (isMobileDe) {
      mobileDeIds = extractMakeModelFromMobileDe(doc, labelMap, title);
      makeModel = extractMakeModelFromLinks(doc, title);
    } else {
      makeModel = extractMakeModelFromLinks(doc, title);
      mobileDeIds = { makeId: null, modelId: null };
    }

    const trimVersion = inferTrimVersion(title, makeModel.make, makeModel.model);
    const firstRegistration = getField("firstRegistration") || getField("year");
    const yearSource = getField("year") || firstRegistration;
    const year = isMobileDe
      ? parseMobileDeYear(yearSource)
      : (yearSource ? Utils.parseInteger(yearSource.match(/\d{4}/)?.[0]) : null);
    const mileage = Utils.parseInteger(getField("mileage"));
    const owners = Utils.parseInteger(getField("owners"));
    const fuel = normalizeFuel(getField("fuel"));
    const transmission = normalizeTransmission(getField("transmission"));
    const powerInfo = parsePowerInfo(getField("power") || getField("engine") || (isMobileDe ? null : getAliasValue(labelMap, "engine")));
    const bodyType = Utils.normalizeWhitespace(getField("bodyType"));
    const location = Utils.normalizeWhitespace(getField("location") || (!isMobileDe ? getAliasValue(labelMap, "location") : null));
    const doors = Utils.parseInteger(getField("doors"));
    const color = Utils.normalizeWhitespace(getField("color"));
    const drivetrain = Utils.normalizeWhitespace(getField("drivetrain"));
    const imageUrl = findPrimaryImage(doc);
    const sellerType = isMobileDe ? null : inferSellerType(doc, lines);
    const sellerName = isMobileDe ? null : findSellerName(doc, lines);
    const equipmentHighlights = extractEquipmentHighlights(lines);
    const equipmentText = equipmentHighlights.join(" | ");
    const descriptionText = extractDescriptionText(lines, title, priceText, location);
    const listingId = Utils.extractListingIdFromUrl(url);
    const vinMatch = pageText.match(/\bVIN[:\s-]*([A-HJ-NPR-Z0-9*]{6,17})\b/i);
    const accidentFree = inferAccidentFree(`${pageText} ${descriptionText}`);
    const serviceHistory = inferServiceHistory(`${pageText} ${descriptionText}`);
    const fieldsPresent = [
      title,
      price,
      makeModel.make,
      makeModel.model,
      year,
      mileage,
      fuel,
      transmission,
      powerInfo.powerKw,
      bodyType,
      sellerName,
      location,
      descriptionText,
      equipmentHighlights.length
    ].filter(Boolean).length;

    return {
      supported: true,
      isListingPage: true,
      available: true,
      reason: "listing",
      site,
      mobileDeIds,
      listingId,
      title,
      url: Utils.trimHash(url),
      canonicalUrl: Utils.trimHash(url),
      priceText: priceText || "",
      price,
      currency,
      make: makeModel.make,
      model: makeModel.model,
      trimVersion,
      year,
      mileage,
      fuel,
      transmission,
      powerKw: powerInfo.powerKw,
      powerHp: powerInfo.powerHp,
      engineSizeCcm: powerInfo.engineSizeCcm,
      bodyType: bodyType || null,
      sellerType,
      sellerName,
      location: location || null,
      imageUrl,
      owners,
      firstRegistration: firstRegistration || null,
      color: color || null,
      drivetrain: drivetrain || null,
      doors,
      vinPartial: vinMatch ? vinMatch[1] : null,
      equipmentHighlights,
      equipmentText,
      descriptionText,
      accidentFree,
      serviceHistory,
      extractedAt: Date.now(),
      extractedFieldsCount: fieldsPresent,
      completeness: Utils.clamp(fieldsPresent / 14, 0, 1),
      contentFingerprint: buildContentFingerprint(doc, url),
      textCorpus: {
        fullText: pageText,
        descriptionText,
        equipmentText
      }
    };
  }

  function parseListingHtml(html, sourceUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ""), "text/html");
    return parseListingDocument(doc, sourceUrl);
  }

  root.Parsing = {
    isAvtoNetPage,
    isMobileDePage,
    isListingPage,
    isResultsPage,
    parseListingDocument,
    parseListingHtml,
    collectLabelMap,
    getAliasValue,
    normalizeFuel,
    normalizeTransmission,
    buildContentFingerprint
  };
}(globalThis));
