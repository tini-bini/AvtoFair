importScripts(
  "lib/constants.js",
  "lib/i18n.js",
  "lib/utils.js",
  "lib/storage.js",
  "lib/notifications.js"
);

(function initServiceWorker(globalScope) {
  const { Constants, Utils, Storage, Notifications } = globalScope.AvtoFair;

  function tabsCreate(createProperties) {
    return new Promise((resolve) => chrome.tabs.create(createProperties, resolve));
  }

  function tabsRemove(tabId) {
    return new Promise((resolve) => chrome.tabs.remove(tabId, resolve));
  }

  function sendTabMessage(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function waitForTabComplete(tabId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Timed out while loading listing tab."));
      }, timeoutMs || 45000);

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  async function ensureAlarm() {
    const settings = await Storage.getSettings();
    if (!settings.notificationsEnabled) {
      chrome.alarms.clear(Constants.WATCHLIST_ALARM_NAME);
      return;
    }

    chrome.alarms.create(Constants.WATCHLIST_ALARM_NAME, {
      periodInMinutes: Constants.WATCHLIST_ALARM_PERIOD_MINUTES
    });
  }

  function withRefreshHash(url) {
    return `${Storage.canonicalizeUrl(url)}#${Constants.REFRESH_HASH}`;
  }

  async function runTabAnalysis(url) {
    const tab = await tabsCreate({
      url: withRefreshHash(url),
      active: false
    });

    try {
      await waitForTabComplete(tab.id, 50000);
      await Utils.sleep(1800);

      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const response = await sendTabMessage(tab.id, {
            type: Constants.MESSAGE_TYPES.ANALYZE_PAGE,
            payload: {
              force: true,
              silent: true
            }
          });

          if (response && response.ok) {
            return response.payload;
          }
        } catch (error) {
          if (attempt === 5) {
            throw error;
          }
        }

        await Utils.sleep(800);
      }

      throw new Error("The background analysis tab never became ready.");
    } finally {
      await tabsRemove(tab.id).catch(() => {});
    }
  }

  async function refreshWatchlistItem(itemId, reason) {
    const watchlist = await Storage.getWatchlist();
    const item = watchlist.find((entry) => entry.id === itemId);

    if (!item) {
      throw new Error("Saved listing not found.");
    }

    const previousPrice = item.currentPrice === undefined || item.currentPrice === null
      ? null
      : item.currentPrice;
    const pageResult = await runTabAnalysis(item.url);

    if (pageResult && pageResult.status === "ready" && pageResult.listing && pageResult.analysis) {
      const saved = await Storage.saveAnalysis({
        listing: pageResult.listing,
        analysis: pageResult.analysis
      }, reason || "background");

      const updatedItem = saved.item;
      const nextPrice = updatedItem.currentPrice === undefined || updatedItem.currentPrice === null
        ? null
        : updatedItem.currentPrice;

      const settings = await Storage.getSettings();
      if (settings.notificationsEnabled && Notifications.shouldNotifyPriceDrop(updatedItem, previousPrice, nextPrice)) {
        await Notifications.createPriceDropNotification(updatedItem, previousPrice, nextPrice, settings.language);
        await Storage.updateNotificationState(updatedItem.id, {
          lastNotifiedPriceDropTo: nextPrice
        });
      }

      return updatedItem;
    }

    if (pageResult && pageResult.status === "unavailable") {
      return Storage.markUnavailable(itemId, reason || "background");
    }

    return Storage.markRefreshError(
      itemId,
      pageResult && pageResult.error ? pageResult.error : "Unable to analyze the listing.",
      reason || "background"
    );
  }

  async function mapWithConcurrency(items, limit, iteratee) {
    const source = Array.isArray(items) ? items : [];
    const concurrency = Math.max(1, Math.min(limit || 1, source.length || 1));
    const results = new Array(source.length);
    let cursor = 0;

    async function worker() {
      while (cursor < source.length) {
        const currentIndex = cursor;
        cursor += 1;
        results[currentIndex] = await iteratee(source[currentIndex], currentIndex);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
  }

  async function refreshBatch(limit, reason, strategy) {
    const watchlist = await Storage.getWatchlist();
    const selected = strategy === "stale"
      ? watchlist.filter((item) => Storage.isStaleWatchlistItem(item))
      : watchlist;
    const prioritized = selected
      .slice()
      .sort((left, right) => (left?.history?.lastChecked || 0) - (right?.history?.lastChecked || 0));
    const slice = prioritized.slice(0, limit || prioritized.length);
    const results = await mapWithConcurrency(slice, 2, async (item) => {
      try {
        const refreshed = await refreshWatchlistItem(item.id, reason || "batch");
        return {
          ok: true,
          item: refreshed
        };
      } catch (error) {
        return {
          ok: false,
          itemId: item.id,
          error: error.message
        };
      }
    });

    return {
      items: results,
      summary: {
        total: results.length,
        ok: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length
      }
    };
  }

  function openDashboardTab() {
    return new Promise((resolve) => {
      chrome.tabs.create({
        url: chrome.runtime.getURL("popup.html?dashboard=1"),
        active: true
      }, resolve);
    });
  }

  chrome.runtime.onInstalled.addListener(() => {
    Storage.ensureDefaults()
      .then(Storage.runCloudSync)
      .catch(() => {})
      .then(ensureAlarm);
  });

  chrome.runtime.onStartup.addListener(() => {
    Storage.ensureDefaults()
      .then(Storage.runCloudSync)
      .catch(() => {})
      .then(ensureAlarm);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== Constants.WATCHLIST_ALARM_NAME) {
      return;
    }

    refreshBatch(3, "scheduled", "stale")
      .then(() => Storage.runCloudSync().catch(() => {}))
      .catch(() => {
      // Silent background failure is acceptable for the MVP.
      });
  });

  chrome.notifications.onClicked.addListener(async (notificationId) => {
    const itemId = notificationId.replace(/^avtofair-drop-/, "");
    const watchlist = await Storage.getWatchlist();
    const item = watchlist.find((entry) => entry.id === itemId);
    if (item && item.url) {
      chrome.tabs.create({ url: item.url, active: true });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (message && message.type === Constants.MESSAGE_TYPES.GET_WATCHLIST) {
        sendResponse({
          ok: true,
          payload: await Storage.getWatchlist()
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.GET_SETTINGS) {
        sendResponse({
          ok: true,
          payload: await Storage.getSettings()
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.UPDATE_SETTINGS) {
        const settings = await Storage.updateSettings(message.payload || {});
        if (!settings.cloudSyncEnabled) {
          await Storage.clearCloudSync().catch(() => {});
        } else {
          await Storage.runCloudSync().catch(() => {});
        }
        await ensureAlarm();
        sendResponse({
          ok: true,
          payload: settings
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.SAVE_ANALYSIS) {
        const saved = await Storage.saveAnalysis(message.payload, sender.tab ? "current-page" : "popup");
        await Storage.runCloudSync().catch(() => {});
        sendResponse({
          ok: true,
          payload: saved
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.REMOVE_WATCHLIST_ITEM) {
        const itemId = message.payload ? message.payload.itemId : null;
        const next = await Storage.removeWatchlistItem(itemId);
        await Storage.runCloudSync().catch(() => {});
        sendResponse({
          ok: true,
          payload: next
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_ITEM) {
        const itemId = message.payload ? message.payload.itemId : null;
        const item = await refreshWatchlistItem(itemId, "manual");
        await Storage.runCloudSync().catch(() => {});
        sendResponse({
          ok: true,
          payload: item
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_BATCH) {
        const limit = message.payload ? message.payload.limit : null;
        const strategy = message.payload ? message.payload.strategy : null;
        const results = await refreshBatch(limit, "popup-batch", strategy);
        await Storage.runCloudSync().catch(() => {});
        sendResponse({
          ok: true,
          payload: results
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_STALE) {
        const limit = message.payload ? message.payload.limit : null;
        const results = await refreshBatch(limit, "popup-stale", "stale");
        await Storage.runCloudSync().catch(() => {});
        sendResponse({
          ok: true,
          payload: results
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.EXPORT_BACKUP) {
        sendResponse({
          ok: true,
          payload: await Storage.exportBackupData()
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.IMPORT_BACKUP) {
        const payload = message.payload || {};
        const result = await Storage.importBackupData(payload.data, payload.mode || "merge");
        if ((await Storage.getSettings()).cloudSyncEnabled) {
          await Storage.runCloudSync().catch(() => {});
        }
        sendResponse({
          ok: true,
          payload: result
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.GET_SYNC_STATUS) {
        sendResponse({
          ok: true,
          payload: await Storage.getSyncStatus()
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.RUN_CLOUD_SYNC) {
        const result = await Storage.runCloudSync();
        sendResponse({
          ok: true,
          payload: result
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.OPEN_DASHBOARD) {
        const tab = await openDashboardTab();
        sendResponse({
          ok: true,
          payload: {
            tabId: tab && tab.id ? tab.id : null
          }
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.PAGE_ANALYSIS_UPDATED) {
        sendResponse({
          ok: true,
          payload: true
        });
        return;
      }

      sendResponse({
        ok: false,
        error: "Unknown background message."
      });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error.message
      });
    });

    return true;
  });
}(globalThis));
