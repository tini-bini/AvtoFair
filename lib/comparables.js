(function initComparables(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const { Constants, Utils, Selectors, Parsing } = root;

  Utils.debug("comparables", "Module initialized");

  function isMobileDeSubject(subject) {
    return subject?.site === Constants.SITES.MOBILEDE;
  }

  function buildMobileDeSearchUrl(subject, page, relaxLevel) {
    const ids = subject.mobileDeIds || {};
    if (!ids.makeId) return null;

    const ranges = buildSearchRanges(subject, relaxLevel);
    const params = new URLSearchParams();
    params.set("isSearchRequest", "true");
    params.set("makeModelVariant1.makeId", ids.makeId);
    if (ids.modelId) params.set("makeModelVariant1.modelId", ids.modelId);
    if (ranges.yearMin > 1990) params.set("minFirstRegistrationDate", `${ranges.yearMin}-01`);
    if (ranges.yearMax < 2090) params.set("maxFirstRegistrationDate", `${ranges.yearMax}-12`);
    if (ranges.kmMin > 0) params.set("minMileage", String(ranges.kmMin));
    if (ranges.kmMax < 9999999) params.set("maxMileage", String(ranges.kmMax));
    if (ranges.kwMin > 0) params.set("minPowerAsKw", String(ranges.kwMin));
    if (ranges.kwMax < 999) params.set("maxPowerAsKw", String(ranges.kwMax));
    params.set("sortOption.sortBy", "price");
    params.set("sortOption.sortOrder", "ASCENDING");
    params.set("pageNumber", String(page || 1));
    return `https://suchen.mobile.de/fahrzeuge/search.html?${params.toString()}`;
  }

  function buildSearchRanges(subject, relaxLevel) {
    const yearPadding = [2, 3, 4, 6][relaxLevel] || 6;
    const kmPaddingFactor = [0.35, 0.5, 0.8, 1.2][relaxLevel] || 1.2;
    const kwPaddingFactor = [0.18, 0.28, 0.4, 1][relaxLevel] || 1;

    const yearMin = subject.year ? Math.max(1990, subject.year - yearPadding) : 0;
    const yearMax = subject.year ? subject.year + yearPadding : 2090;
    const kmWindow = subject.mileage ? Math.max(40000, Math.round(subject.mileage * kmPaddingFactor)) : 9999999;
    const kmMin = subject.mileage ? Math.max(0, subject.mileage - kmWindow) : 0;
    const kmMax = subject.mileage ? subject.mileage + kmWindow : 9999999;
    const kwWindow = subject.powerKw ? Math.max(18, Math.round(subject.powerKw * kwPaddingFactor)) : 999;
    const kwMin = subject.powerKw && relaxLevel < 3 ? Math.max(0, subject.powerKw - kwWindow) : 0;
    const kwMax = subject.powerKw && relaxLevel < 3 ? subject.powerKw + kwWindow : 999;

    return {
      yearMin,
      yearMax,
      kmMin,
      kmMax,
      kwMin,
      kwMax
    };
  }

  function buildSearchUrl(subject, page, relaxLevel) {
    const baseUrl = new URL("https://www.avto.net/Ads/results.asp");
    const searchParams = new URLSearchParams(Constants.SEARCH_DEFAULTS);
    const ranges = buildSearchRanges(subject, relaxLevel);

    searchParams.set("znamka", subject.make || "");
    searchParams.set("model", subject.model || "");
    searchParams.set("letnikMin", String(ranges.yearMin));
    searchParams.set("letnikMax", String(ranges.yearMax));
    searchParams.set("kmMin", String(ranges.kmMin));
    searchParams.set("kmMax", String(ranges.kmMax));
    searchParams.set("kwMin", String(ranges.kwMin));
    searchParams.set("kwMax", String(ranges.kwMax));
    searchParams.set("stran", String(page || 1));

    baseUrl.search = searchParams.toString();
    return baseUrl.toString();
  }

  function parseComparableFromContainer(anchor, subject) {
    const listingId = Utils.extractListingIdFromUrl(anchor.href);
    if (!listingId) {
      return null;
    }

    let container = anchor;
    const documentBody = anchor.ownerDocument?.body || null;
    while (container && container !== documentBody) {
      const textLength = Utils.normalizeWhitespace(container.textContent).length;
      if (textLength >= 40 && textLength <= 1500) {
        break;
      }
      container = container.parentElement;
    }

    container = container || anchor;
    const text = Utils.normalizeWhitespace(container.innerText || container.textContent || "");
    const normalizedText = Utils.normalizeLabel(text);
    if (!text) {
      return null;
    }

    const priceMatch = text.match(/(\d[\d.\s]{1,12})\s*(?:\u20AC|eur)/i);
    const price = Utils.parsePrice(priceMatch?.[0]);
    const yearMatch = text.match(/(?:1\.?\s*registracija|Leto proizvodnje|EZ|Erstzulassung)?\s*(20\d{2}|19\d{2})/i);
    const mileageMatch = text.match(/(\d[\d.\s]{2,12})\s*km/i);
    const kwMatch = text.match(/(\d{2,4})\s*kW/i);
    const hpMatch = text.match(/(\d{2,4})\s*KM/i);
    const ccmMatch = text.match(/(\d{3,5})\s*ccm/i);
    const title = Utils.normalizeWhitespace(anchor.textContent || "")
      || Utils.normalizeWhitespace(container.querySelector("h3, h4, strong")?.textContent || "");

    const fuel = Parsing.normalizeFuel(normalizedText.match(/(?:gorivo\s*)?(diesel|bencin|benzin|elektrika|electric|elektro|hybrid|hibrid)/i)?.[1]);
    const transmission = Parsing.normalizeTransmission(normalizedText.match(/\b(rocni(?:\s+\d+\s*pr\.)?|avtomatik|rocni menjalnik|samodejni menjalnik|schaltgetriebe|automatikgetriebe|automatik|schaltung)\b/i)?.[1]);
    const imageUrl = Utils.makeAbsoluteUrl(container.querySelector("img[src]")?.getAttribute("src"));

    const comparable = {
      listingId,
      url: Utils.makeAbsoluteUrl(anchor.href),
      title: title || null,
      price,
      priceText: priceMatch?.[0] || "",
      year: yearMatch ? Utils.parseInteger(yearMatch[1]) : null,
      mileage: mileageMatch ? Utils.parseInteger(mileageMatch[1]) : null,
      fuel: fuel || null,
      transmission: transmission || null,
      powerKw: kwMatch ? Utils.parseInteger(kwMatch[1]) : null,
      powerHp: hpMatch ? Utils.parseInteger(hpMatch[1]) : null,
      engineSizeCcm: ccmMatch ? Utils.parseInteger(ccmMatch[1]) : null,
      bodyType: null,
      imageUrl,
      sourceText: text
    };

    comparable.similarityScore = scoreComparable(subject, comparable);
    comparable.qualityScore = [
      comparable.price,
      comparable.year,
      comparable.mileage,
      comparable.fuel,
      comparable.transmission,
      comparable.powerKw
    ].filter(Boolean).length;

    return comparable.price ? comparable : null;
  }

  function parseResultsHtml(html, sourceUrl, subject) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ""), "text/html");
    const pageText = Utils.normalizeLabel(doc.body.innerText || "");

    if (pageText.includes("performing security verification") || pageText.includes("just a moment") || pageText.includes("cf turnstile response")) {
      throw new Error("Market search was blocked by security verification.");
    }

    // No results — both Slovenian and German
    if (pageText.includes("trenutno ni oglasov") || pageText.includes("ni zadetkov") ||
        pageText.includes("keine inserate") || pageText.includes("keine ergebnisse") ||
        pageText.includes("leider keine fahrzeuge")) {
      return [];
    }

    const isMobileDe = isMobileDeSubject(subject);
    const linkSelector = isMobileDe
      ? Selectors.mobileDe.searchResultLinkSelector
      : Selectors.searchResultLinkSelector;

    const anchors = Array.from(doc.querySelectorAll(linkSelector));
    const comparables = anchors
      .map((anchor) => parseComparableFromContainer(anchor, subject))
      .filter(Boolean)
      .filter((item) => item.url !== Utils.trimHash(sourceUrl));

    return Utils.dedupeBy(comparables, (item) => item.listingId || item.url);
  }

  function scoreComparable(subject, comparable) {
    let score = 100;

    if (subject.year && comparable.year) {
      score -= Math.min(28, Math.abs(subject.year - comparable.year) * 7);
    }

    if (subject.mileage && comparable.mileage) {
      score -= Math.min(24, Math.abs(subject.mileage - comparable.mileage) / 15000 * 4);
    }

    if (subject.fuel && comparable.fuel && subject.fuel !== comparable.fuel) {
      score -= 18;
    }

    if (subject.transmission && comparable.transmission && subject.transmission !== comparable.transmission) {
      score -= 10;
    }

    if (subject.powerKw && comparable.powerKw) {
      const differenceRatio = Math.abs(subject.powerKw - comparable.powerKw) / Math.max(subject.powerKw, 1);
      score -= Math.min(18, differenceRatio * 45);
    }

    if (subject.engineSizeCcm && comparable.engineSizeCcm) {
      score -= Math.min(10, Math.abs(subject.engineSizeCcm - comparable.engineSizeCcm) / 200);
    }

    score += Math.min(6, comparable.qualityScore || 0);

    return Math.round(Utils.clamp(score, 5, 100));
  }

  function removeOutliers(comparables) {
    if ((comparables || []).length < 5) {
      return comparables || [];
    }

    const prices = comparables.map((item) => item.price).filter(Boolean);
    const q1 = Utils.quantile(prices, 0.25);
    const q3 = Utils.quantile(prices, 0.75);
    if (q1 === null || q3 === null) {
      return comparables || [];
    }

    const iqr = q3 - q1;
    const lowerBound = q1 - iqr * 1.5;
    const upperBound = q3 + iqr * 1.5;

    return comparables.filter((item) => item.price >= lowerBound && item.price <= upperBound);
  }

  function selectComparables(subject, comparables) {
    const filtered = (comparables || [])
      .filter((item) => item.price && item.title)
      .filter((item) => item.listingId !== subject.listingId);

    // Weight by field completeness: prefer comparables with more data points
    const withScores = filtered.map((item) => {
      const fieldCount = [
        item.price,
        item.year,
        item.mileage,
        item.fuel,
        item.transmission,
        item.powerKw
      ].filter(Boolean).length;
      const completenessBonus = (fieldCount / 6) * 8; // Up to 8-point bonus
      return {
        item,
        score: (item.similarityScore || 0) + completenessBonus
      };
    }).sort((left, right) => right.score - left.score);

    const withoutOutliers = removeOutliers(withScores.map(({ item }) => item));
    return withoutOutliers.slice(0, Constants.MAX_COMPARABLES);
  }

  async function fetchResultsPage(url, abortSignal) {
    const response = await globalScope.fetch(url, {
      credentials: "include",
      signal: abortSignal,
      headers: {
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      throw new Error(`Comparable fetch failed with status ${response.status}`);
    }

    return response.text();
  }

  async function findComparables(subject, options) {
    const config = Object.assign({
      maxPages: Constants.MAX_COMPARABLE_PAGES,
      minComparables: Constants.MIN_COMPARABLES,
      minimumUsefulComparables: 2,
      abortSignal: null
    }, options || {});

    const mobileDe = isMobileDeSubject(subject);

    if (mobileDe && !subject?.mobileDeIds?.makeId) {
      return {
        comparables: [],
        searchUrls: [],
        fetchErrors: ["mobile.de: could not find make ID on page"],
        relaxedLevel: null
      };
    }

    if (!mobileDe && !subject?.make && !subject?.model) {
      return {
        comparables: [],
        searchUrls: [],
        fetchErrors: ["Missing make/model"],
        relaxedLevel: null
      };
    }

    const aggregated = [];
    const searchUrls = [];
    const fetchErrors = [];
    let selected = [];
    let winningRelaxLevel = 0;

    for (let relaxLevel = 0; relaxLevel <= 3; relaxLevel += 1) {
      for (let page = 1; page <= config.maxPages; page += 1) {
        if (config.abortSignal?.aborted) {
          fetchErrors.push("Search cancelled");
          break;
        }

        const url = mobileDe
          ? buildMobileDeSearchUrl(subject, page, relaxLevel)
          : buildSearchUrl(subject, page, relaxLevel);
        if (!url) break;
        searchUrls.push(url);

        try {
          const html = await fetchResultsPage(url, config.abortSignal);
          const parsed = parseResultsHtml(html, url, subject);
          aggregated.push(...parsed);
          selected = selectComparables(
            subject,
            Utils.dedupeBy(aggregated, (item) => item.listingId || item.url)
          );

          if (selected.length >= config.minComparables) {
            winningRelaxLevel = relaxLevel;
            return {
              comparables: selected,
              searchUrls,
              fetchErrors,
              relaxedLevel: winningRelaxLevel
            };
          }
        } catch (error) {
          if (error.name === "AbortError") {
            Utils.debug("comparables", "Search cancelled at relaxLevel", { relaxLevel, page });
            fetchErrors.push("Search cancelled");
            return {
              comparables: selected,
              searchUrls,
              fetchErrors,
              relaxedLevel: winningRelaxLevel
            };
          }
          Utils.debug("comparables", "Fetch error", { relaxLevel, page, error: error.message });
          fetchErrors.push(error.message);
        }
      }

      winningRelaxLevel = relaxLevel;
    }

    return {
      comparables: selected,
      searchUrls,
      fetchErrors,
      relaxedLevel: winningRelaxLevel
    };
  }

  root.Comparables = {
    buildSearchUrl,
    findComparables,
    parseResultsHtml,
    scoreComparable,
    selectComparables
  };
}(globalThis));
