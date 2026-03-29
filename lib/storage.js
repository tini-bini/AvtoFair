(function initStorage(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const Constants = root.Constants;
  const Utils = root.Utils;
  const SYNC_KEYS = {
    PAYLOAD: "avtofair.sync.payload"
  };

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

  function syncGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, resolve);
    });
  }

  function syncSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(values, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function syncRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
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
      Constants.STORAGE_KEYS.PANEL_STATE,
      Constants.STORAGE_KEYS.SYNC_STATUS
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

    if (!stored[Constants.STORAGE_KEYS.SYNC_STATUS]) {
      next[Constants.STORAGE_KEYS.SYNC_STATUS] = {
        lastSyncedAt: null,
        lastError: null
      };
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
    const list = Array.isArray(stored[Constants.STORAGE_KEYS.WATCHLIST]) ? stored[Constants.STORAGE_KEYS.WATCHLIST] : [];
    return list.map((item) => normalizeWatchlistItem(item));
  }

  async function setWatchlist(list) {
    const normalizedList = (Array.isArray(list) ? list : []).map((item) => normalizeWatchlistItem(item));
    await localSet({
      [Constants.STORAGE_KEYS.WATCHLIST]: normalizedList
    });
    return normalizedList;
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

  function normalizePricePoints(points) {
    return (Array.isArray(points) ? points : [])
      .filter((point) => point && typeof point.value === "number" && Number.isFinite(point.value))
      .map((point) => ({
        timestamp: typeof point.timestamp === "number" ? point.timestamp : Date.now(),
        value: point.value
      }))
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(-24);
  }

  function appendPricePoint(history, currentPrice, timestamp) {
    if (!Number.isFinite(currentPrice)) {
      return normalizePricePoints(history && history.pricePoints);
    }

    const pricePoints = normalizePricePoints(history && history.pricePoints);
    const nextPoint = {
      timestamp: typeof timestamp === "number" ? timestamp : Date.now(),
      value: currentPrice
    };
    const lastPoint = pricePoints[pricePoints.length - 1];

    if (lastPoint && lastPoint.value === nextPoint.value) {
      pricePoints[pricePoints.length - 1] = nextPoint;
      return pricePoints;
    }

    pricePoints.push(nextPoint);
    return pricePoints.slice(-24);
  }

  function mergePointSeries(left, right) {
    const merged = normalizePricePoints([].concat(left || [], right || []));
    return merged.filter((point, index) => {
      const previous = merged[index - 1];
      return !previous || previous.timestamp !== point.timestamp || previous.value !== point.value;
    }).slice(-24);
  }

  function normalizeHistory(history, currentPrice) {
    const base = history || {};
    const priceEvents = Array.isArray(base.priceEvents) ? base.priceEvents.slice() : [];
    let pricePoints = normalizePricePoints(base.pricePoints);

    if (!pricePoints.length && Number.isFinite(currentPrice)) {
      const fallbackTimestamp = base.lastChecked || base.dateAdded || Date.now();
      pricePoints = appendPricePoint(base, currentPrice, fallbackTimestamp);
    }

    return {
      dateAdded: typeof base.dateAdded === "number" ? base.dateAdded : Date.now(),
      lastChecked: typeof base.lastChecked === "number" ? base.lastChecked : null,
      priceEvents,
      pricePoints
    };
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

  function normalizeWatchlistItem(item) {
    const source = item || {};
    const currentPrice = !isNullish(source.currentPrice) ? source.currentPrice : null;

    return {
      id: source.id || buildItemId(source),
      url: canonicalizeUrl(source.url || ""),
      listingId: source.listingId || null,
      title: source.title || "Avto.net listing",
      imageUrl: source.imageUrl || null,
      sellerName: source.sellerName || null,
      sellerType: source.sellerType || null,
      location: source.location || null,
      extracted: buildExtractedRecord(source.extracted || source, source.extracted || null),
      currentPrice,
      currentPriceText: source.currentPriceText || source.priceText || "",
      currency: source.currency || Constants.CURRENCY,
      analysis: buildAnalysisRecord(source.analysis || null),
      history: normalizeHistory(source.history, currentPrice),
      notificationState: Object.assign({
        lastNotifiedPriceDropTo: null
      }, source.notificationState || {}),
      meta: Object.assign({
        lastRefreshSource: "manual",
        lastError: null
      }, source.meta || {})
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
      priceEvents: [],
      pricePoints: []
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
        priceEvents: event ? appendPriceEvent(history, event) : (Array.isArray(history.priceEvents) ? history.priceEvents : []),
        pricePoints: appendPricePoint(history, currentPrice, now)
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

  async function getSyncStatus() {
    const stored = await localGet(Constants.STORAGE_KEYS.SYNC_STATUS);
    return Object.assign({
      lastSyncedAt: null,
      lastError: null
    }, stored[Constants.STORAGE_KEYS.SYNC_STATUS] || {});
  }

  async function updateSyncStatus(patch) {
    const next = Object.assign({}, await getSyncStatus(), patch || {});
    await localSet({
      [Constants.STORAGE_KEYS.SYNC_STATUS]: next
    });
    return next;
  }

  function mergePriceEvents(left, right) {
    const merged = [].concat(left || [], right || []).filter(Boolean);
    merged.sort((first, second) => (first.timestamp || 0) - (second.timestamp || 0));
    return merged.filter((event, index) => {
      const previous = merged[index - 1];
      if (!previous) {
        return true;
      }
      return previous.timestamp !== event.timestamp
        || previous.type !== event.type
        || previous.newPrice !== event.newPrice;
    }).slice(-30);
  }

  function mergeWatchlistRecords(existingItem, incomingItem) {
    const base = normalizeWatchlistItem(existingItem);
    const incoming = normalizeWatchlistItem(incomingItem);
    const winner = (incoming.history.lastChecked || 0) >= (base.history.lastChecked || 0) ? incoming : base;
    const fallback = winner === incoming ? base : incoming;

    return normalizeWatchlistItem({
      id: winner.id || fallback.id,
      url: winner.url || fallback.url,
      listingId: winner.listingId || fallback.listingId,
      title: winner.title || fallback.title,
      imageUrl: winner.imageUrl || fallback.imageUrl,
      sellerName: winner.sellerName || fallback.sellerName,
      sellerType: winner.sellerType || fallback.sellerType,
      location: winner.location || fallback.location,
      extracted: Object.assign({}, fallback.extracted || {}, winner.extracted || {}),
      currentPrice: !isNullish(winner.currentPrice) ? winner.currentPrice : fallback.currentPrice,
      currentPriceText: winner.currentPriceText || fallback.currentPriceText,
      currency: winner.currency || fallback.currency,
      analysis: Object.assign({}, fallback.analysis || {}, winner.analysis || {}),
      history: {
        dateAdded: Math.min(base.history.dateAdded || Date.now(), incoming.history.dateAdded || Date.now()),
        lastChecked: Math.max(base.history.lastChecked || 0, incoming.history.lastChecked || 0) || null,
        priceEvents: mergePriceEvents(base.history.priceEvents, incoming.history.priceEvents),
        pricePoints: mergePointSeries(base.history.pricePoints, incoming.history.pricePoints)
      },
      notificationState: Object.assign({}, fallback.notificationState || {}, winner.notificationState || {}),
      meta: Object.assign({}, fallback.meta || {}, winner.meta || {})
    });
  }

  function mergeWatchlists(existingList, incomingList) {
    const next = (Array.isArray(existingList) ? existingList : []).map((item) => normalizeWatchlistItem(item));

    for (const incomingRaw of (Array.isArray(incomingList) ? incomingList : [])) {
      const incoming = normalizeWatchlistItem(incomingRaw);
      const existing = findExistingItem(next, incoming);

      if (!existing) {
        next.push(incoming);
        continue;
      }

      const merged = mergeWatchlistRecords(existing, incoming);
      const index = next.findIndex((item) => item.id === existing.id);
      next[index] = merged;
    }

    return next.sort((left, right) => (right.history.lastChecked || 0) - (left.history.lastChecked || 0));
  }

  function buildBackupPayload(settings, watchlist) {
    return {
      schemaVersion: 2,
      exportedAt: Date.now(),
      settings: normalizeStoredSettings(settings),
      watchlist: (Array.isArray(watchlist) ? watchlist : []).map((item) => normalizeWatchlistItem(item))
    };
  }

  async function exportBackupData() {
    return buildBackupPayload(await getSettings(), await getWatchlist());
  }

  async function importBackupData(payload, mode) {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : (payload || {});
    const importedSettings = normalizeStoredSettings(parsed.settings || {});
    const importedWatchlist = (Array.isArray(parsed.watchlist) ? parsed.watchlist : []).map((item) => normalizeWatchlistItem(item));
    const existingWatchlist = await getWatchlist();
    const nextWatchlist = mode === "replace"
      ? importedWatchlist
      : mergeWatchlists(existingWatchlist, importedWatchlist);
    const currentSettings = await getSettings();
    const nextSettings = normalizeStoredSettings(Object.assign({}, currentSettings, importedSettings, {
      cloudSyncEnabled: currentSettings.cloudSyncEnabled
    }));

    await updateSettings(nextSettings);
    await setWatchlist(nextWatchlist);

    return {
      settings: nextSettings,
      watchlist: nextWatchlist
    };
  }

  async function clearCloudSync() {
    await syncRemove(SYNC_KEYS.PAYLOAD).catch(() => {});
    return updateSyncStatus({
      lastSyncedAt: null,
      lastError: null
    });
  }

  async function runCloudSync() {
    const settings = await getSettings();
    if (!settings.cloudSyncEnabled) {
      return {
        ok: false,
        skipped: true
      };
    }

    const localPayload = await exportBackupData();
    const serialized = JSON.stringify(localPayload);

    if (serialized.length > 90000) {
      await updateSyncStatus({
        lastError: "Backup is too large for Chrome sync storage.",
        lastSyncedAt: null
      });
      return {
        ok: false,
        error: "Backup is too large for Chrome sync storage."
      };
    }

    try {
      const synced = await syncGet(SYNC_KEYS.PAYLOAD);
      const remotePayload = synced[SYNC_KEYS.PAYLOAD] || null;

      if (remotePayload && remotePayload.exportedAt > localPayload.exportedAt) {
        await importBackupData(remotePayload, "merge");
      }

      const mergedPayload = await exportBackupData();
      await syncSet({
        [SYNC_KEYS.PAYLOAD]: mergedPayload
      });

      await updateSyncStatus({
        lastSyncedAt: Date.now(),
        lastError: null
      });

      return {
        ok: true,
        lastSyncedAt: Date.now()
      };
    } catch (error) {
      await updateSyncStatus({
        lastError: error.message,
        lastSyncedAt: null
      });
      return {
        ok: false,
        error: error.message
      };
    }
  }

  function isStaleWatchlistItem(item) {
    const lastChecked = item?.history?.lastChecked || 0;
    return !lastChecked
      || (Date.now() - lastChecked) >= Constants.STALE_REFRESH_AGE_MS
      || Boolean(item?.meta?.lastError);
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
    getSyncStatus,
    updateSyncStatus,
    exportBackupData,
    importBackupData,
    runCloudSync,
    clearCloudSync,
    isStaleWatchlistItem,
    mergeWatchlists,
    canonicalizeUrl,
    findExistingItem
  };
}(globalThis));
