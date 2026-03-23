(function initStorage(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const Constants = root.Constants;
  const Utils = root.Utils;

  function isNullish(value) {
    return value === null || value === undefined;
  }

  function firstDefined() {
    let index = 0;
    while (index < arguments.length) {
      if (!isNullish(arguments[index])) {
        return arguments[index];
      }
      index += 1;
    }
    return null;
  }

  function localGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function localSet(values) {
    return new Promise((resolve) => {
      chrome.storage.local.set(values, resolve);
    });
  }

  function canonicalizeUrl(url) {
    return Utils.trimHash(url || "");
  }

  function normalizeStoredSettings(rawSettings) {
    const settings = Object.assign({}, Constants.DEFAULT_SETTINGS, rawSettings || {});

    if (typeof settings.showFloatingPanel !== "boolean" && typeof settings.showWidget === "boolean") {
      settings.showFloatingPanel = settings.showWidget;
    }

    delete settings.showWidget;
    return settings;
  }

  async function ensureDefaults() {
    const stored = await localGet([
      Constants.STORAGE_KEYS.SETTINGS,
      Constants.STORAGE_KEYS.WATCHLIST,
      Constants.STORAGE_KEYS.PANEL_STATE
    ]);

    const next = {};

    if (!stored[Constants.STORAGE_KEYS.SETTINGS]) {
      next[Constants.STORAGE_KEYS.SETTINGS] = Constants.DEFAULT_SETTINGS;
    } else {
      next[Constants.STORAGE_KEYS.SETTINGS] = normalizeStoredSettings(stored[Constants.STORAGE_KEYS.SETTINGS]);
    }

    if (!stored[Constants.STORAGE_KEYS.WATCHLIST]) {
      next[Constants.STORAGE_KEYS.WATCHLIST] = [];
    }

    if (!stored[Constants.STORAGE_KEYS.PANEL_STATE]) {
      next[Constants.STORAGE_KEYS.PANEL_STATE] = Constants.DEFAULT_PANEL_STATE;
    }

    if (Object.keys(next).length) {
      await localSet(next);
    }
  }

  async function getSettings() {
    const stored = await localGet(Constants.STORAGE_KEYS.SETTINGS);
    return normalizeStoredSettings(stored[Constants.STORAGE_KEYS.SETTINGS]);
  }

  async function updateSettings(patch) {
    const settings = await getSettings();
    const next = normalizeStoredSettings(Object.assign({}, settings, patch || {}));
    await localSet({
      [Constants.STORAGE_KEYS.SETTINGS]: next
    });
    return next;
  }

  async function getPanelState() {
    const stored = await localGet(Constants.STORAGE_KEYS.PANEL_STATE);
    return Object.assign({}, Constants.DEFAULT_PANEL_STATE, stored[Constants.STORAGE_KEYS.PANEL_STATE] || {});
  }

  async function updatePanelState(patch) {
    const panelState = await getPanelState();
    const next = Object.assign({}, panelState, patch || {});
    await localSet({
      [Constants.STORAGE_KEYS.PANEL_STATE]: next
    });
    return next;
  }

  async function resetPanelState() {
    await localSet({
      [Constants.STORAGE_KEYS.PANEL_STATE]: Constants.DEFAULT_PANEL_STATE
    });
    return Constants.DEFAULT_PANEL_STATE;
  }

  async function getWatchlist() {
    const stored = await localGet(Constants.STORAGE_KEYS.WATCHLIST);
    return Array.isArray(stored[Constants.STORAGE_KEYS.WATCHLIST]) ? stored[Constants.STORAGE_KEYS.WATCHLIST] : [];
  }

  async function setWatchlist(list) {
    await localSet({
      [Constants.STORAGE_KEYS.WATCHLIST]: list
    });
    return list;
  }

  function buildItemId(listing) {
    return listing.listingId || `saved-${Utils.slugify(listing.title || "car")}-${Date.now()}`;
  }

  function createPriceEvent(oldPrice, newPrice, type) {
    return {
      timestamp: Date.now(),
      oldPrice: isNullish(oldPrice) ? null : oldPrice,
      newPrice: isNullish(newPrice) ? null : newPrice,
      type
    };
  }

  function appendPriceEvent(history, event) {
    const priceEvents = history && Array.isArray(history.priceEvents) ? history.priceEvents.slice() : [];
    const lastEvent = priceEvents[priceEvents.length - 1];

    if (lastEvent && lastEvent.type === event.type && lastEvent.newPrice === event.newPrice) {
      return priceEvents;
    }

    priceEvents.push(event);
    return priceEvents;
  }

  function buildAnalysisRecord(analysis) {
    const source = analysis || {};

    return {
      fairPrice: isNullish(source.fairPrice) ? null : source.fairPrice,
      fairRangeMin: isNullish(source.fairRangeMin) ? null : source.fairRangeMin,
      fairRangeMax: isNullish(source.fairRangeMax) ? null : source.fairRangeMax,
      deviationPercent: isNullish(source.deviationPercent) ? null : source.deviationPercent,
      dealScore: isNullish(source.dealScore) ? null : source.dealScore,
      verdict: source.verdict || "insufficient-data",
      confidence: source.confidence || "low",
      comparableCount: isNullish(source.comparableCount) ? 0 : source.comparableCount,
      summary: source.summary || "Not enough data yet.",
      subscores: source.subscores || {},
      scoreBandLabel: source.scoreBandLabel || null,
      explanationBullets: source.explanationBullets || [],
      positiveSignals: source.positiveSignals || [],
      negativeSignals: source.negativeSignals || [],
      riskFlags: source.riskFlags || [],
      equipmentSignals: source.equipmentSignals || [],
      descriptionQualityScore: isNullish(source.descriptionQualityScore) ? null : source.descriptionQualityScore,
      equipmentScore: isNullish(source.equipmentScore) ? null : source.equipmentScore,
      trustScore: isNullish(source.trustScore) ? null : source.trustScore,
      riskScore: isNullish(source.riskScore) ? null : source.riskScore,
      marketSpreadPercent: isNullish(source.marketSpreadPercent) ? null : source.marketSpreadPercent
    };
  }

  function buildExtractedRecord(listing, existing) {
    const sourceListing = listing || {};
    const sourceExisting = existing || {};

    return {
      make: firstDefined(sourceListing.make, sourceExisting.make),
      model: firstDefined(sourceListing.model, sourceExisting.model),
      trimVersion: firstDefined(sourceListing.trimVersion, sourceExisting.trimVersion),
      year: firstDefined(sourceListing.year, sourceExisting.year),
      firstRegistration: firstDefined(sourceListing.firstRegistration, sourceExisting.firstRegistration),
      mileage: firstDefined(sourceListing.mileage, sourceExisting.mileage),
      fuel: firstDefined(sourceListing.fuel, sourceExisting.fuel),
      transmission: firstDefined(sourceListing.transmission, sourceExisting.transmission),
      powerKw: firstDefined(sourceListing.powerKw, sourceExisting.powerKw),
      powerHp: firstDefined(sourceListing.powerHp, sourceExisting.powerHp),
      bodyType: firstDefined(sourceListing.bodyType, sourceExisting.bodyType),
      engineSizeCcm: firstDefined(sourceListing.engineSizeCcm, sourceExisting.engineSizeCcm),
      color: firstDefined(sourceListing.color, sourceExisting.color),
      drivetrain: firstDefined(sourceListing.drivetrain, sourceExisting.drivetrain),
      doors: firstDefined(sourceListing.doors, sourceExisting.doors),
      descriptionText: firstDefined(sourceListing.descriptionText, sourceExisting.descriptionText, ""),
      equipmentHighlights: firstDefined(sourceListing.equipmentHighlights, sourceExisting.equipmentHighlights, [])
    };
  }

  function mergeWatchlistItem(existingItem, payload, source) {
    const listing = payload.listing || {};
    const analysis = payload.analysis || null;
    const now = Date.now();
    const previousPrice = existingItem && !isNullish(existingItem.currentPrice) ? existingItem.currentPrice : null;
    const currentPrice = !isNullish(listing.price) ? listing.price : previousPrice;
    const history = existingItem && existingItem.history ? existingItem.history : {
      dateAdded: now,
      lastChecked: null,
      priceEvents: []
    };

    let event = null;
    if (existingItem) {
      if (currentPrice === null) {
        event = createPriceEvent(previousPrice, null, "unavailable");
      } else if (previousPrice === null) {
        event = createPriceEvent(null, currentPrice, "unchanged");
      } else if (currentPrice < previousPrice) {
        event = createPriceEvent(previousPrice, currentPrice, "drop");
      } else if (currentPrice > previousPrice) {
        event = createPriceEvent(previousPrice, currentPrice, "increase");
      } else {
        event = createPriceEvent(previousPrice, currentPrice, "unchanged");
      }
    }

    return {
      id: existingItem && existingItem.id ? existingItem.id : buildItemId(listing),
      url: canonicalizeUrl(listing.url || (existingItem && existingItem.url ? existingItem.url : "")),
      listingId: listing.listingId || (existingItem && existingItem.listingId ? existingItem.listingId : null),
      title: listing.title || (existingItem && existingItem.title ? existingItem.title : "Avto.net listing"),
      imageUrl: listing.imageUrl || (existingItem && existingItem.imageUrl ? existingItem.imageUrl : null),
      sellerName: listing.sellerName || (existingItem && existingItem.sellerName ? existingItem.sellerName : null),
      sellerType: listing.sellerType || (existingItem && existingItem.sellerType ? existingItem.sellerType : null),
      location: listing.location || (existingItem && existingItem.location ? existingItem.location : null),
      extracted: buildExtractedRecord(listing, existingItem && existingItem.extracted ? existingItem.extracted : null),
      currentPrice,
      currentPriceText: listing.priceText || (existingItem && existingItem.currentPriceText ? existingItem.currentPriceText : ""),
      currency: listing.currency || (existingItem && existingItem.currency ? existingItem.currency : Constants.CURRENCY),
      analysis: buildAnalysisRecord(analysis || (existingItem ? existingItem.analysis : null)),
      history: {
        dateAdded: history && history.dateAdded ? history.dateAdded : now,
        lastChecked: now,
        priceEvents: event ? appendPriceEvent(history, event) : (Array.isArray(history.priceEvents) ? history.priceEvents : [])
      },
      notificationState: {
        lastNotifiedPriceDropTo: existingItem
          && existingItem.notificationState
          && !isNullish(existingItem.notificationState.lastNotifiedPriceDropTo)
          ? existingItem.notificationState.lastNotifiedPriceDropTo
          : null
      },
      meta: {
        lastRefreshSource: source || "manual",
        lastError: null
      }
    };
  }

  function findExistingItem(list, listing) {
    const canonicalUrl = canonicalizeUrl(listing.url);
    return (list || []).find((item) => {
      if (item.listingId && listing.listingId) {
        return item.listingId === listing.listingId;
      }
      return canonicalizeUrl(item.url) === canonicalUrl;
    }) || null;
  }

  async function saveAnalysis(payload, source) {
    const watchlist = await getWatchlist();
    const existing = findExistingItem(watchlist, payload.listing);
    const merged = mergeWatchlistItem(existing, payload, source);
    const next = existing
      ? watchlist.map((item) => item.id === existing.id ? merged : item)
      : [merged].concat(watchlist);

    await setWatchlist(next);
    return {
      item: merged,
      existed: Boolean(existing)
    };
  }

  async function removeWatchlistItem(itemId) {
    const watchlist = await getWatchlist();
    const next = watchlist.filter((item) => item.id !== itemId);
    await setWatchlist(next);
    return next;
  }

  async function markUnavailable(itemId, source) {
    const watchlist = await getWatchlist();
    const next = watchlist.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      return Object.assign({}, item, {
        history: Object.assign({}, item.history || {}, {
          lastChecked: Date.now(),
          priceEvents: appendPriceEvent(item.history || {}, createPriceEvent(item.currentPrice, null, "unavailable"))
        }),
        meta: Object.assign({}, item.meta || {}, {
          lastRefreshSource: source || "background",
          lastError: "Listing unavailable"
        })
      });
    });

    await setWatchlist(next);
    return next.find((item) => item.id === itemId) || null;
  }

  async function markRefreshError(itemId, message, source) {
    const watchlist = await getWatchlist();
    const next = watchlist.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      return Object.assign({}, item, {
        history: Object.assign({}, item.history || {}, {
          lastChecked: Date.now()
        }),
        meta: Object.assign({}, item.meta || {}, {
          lastRefreshSource: source || "background",
          lastError: message || "Refresh failed"
        })
      });
    });

    await setWatchlist(next);
    return next.find((item) => item.id === itemId) || null;
  }

  async function updateNotificationState(itemId, patch) {
    const watchlist = await getWatchlist();
    const next = watchlist.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      return Object.assign({}, item, {
        notificationState: Object.assign({}, item.notificationState || {}, patch || {})
      });
    });

    await setWatchlist(next);
    return next.find((item) => item.id === itemId) || null;
  }

  root.Storage = {
    ensureDefaults,
    getSettings,
    updateSettings,
    getPanelState,
    updatePanelState,
    resetPanelState,
    getWatchlist,
    setWatchlist,
    saveAnalysis,
    removeWatchlistItem,
    markUnavailable,
    markRefreshError,
    updateNotificationState,
    canonicalizeUrl,
    findExistingItem
  };
}(globalThis));
