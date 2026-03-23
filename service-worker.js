importScripts(
  "lib/constants.js",
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
        await Notifications.createPriceDropNotification(updatedItem, previousPrice, nextPrice);
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

  async function refreshBatch(limit, reason) {
    const watchlist = await Storage.getWatchlist();
    const slice = watchlist.slice(0, limit || watchlist.length);
    const results = [];

    for (const item of slice) {
      try {
        const refreshed = await refreshWatchlistItem(item.id, reason || "batch");
        results.push({
          ok: true,
          item: refreshed
        });
      } catch (error) {
        results.push({
          ok: false,
          itemId: item.id,
          error: error.message
        });
      }
    }

    return results;
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
    Storage.ensureDefaults().then(ensureAlarm);
  });

  chrome.runtime.onStartup.addListener(() => {
    Storage.ensureDefaults().then(ensureAlarm);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== Constants.WATCHLIST_ALARM_NAME) {
      return;
    }

    refreshBatch(3, "scheduled").catch(() => {
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
        await ensureAlarm();
        sendResponse({
          ok: true,
          payload: settings
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.SAVE_ANALYSIS) {
        const saved = await Storage.saveAnalysis(message.payload, sender.tab ? "current-page" : "popup");
        sendResponse({
          ok: true,
          payload: saved
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.REMOVE_WATCHLIST_ITEM) {
        const itemId = message.payload ? message.payload.itemId : null;
        const next = await Storage.removeWatchlistItem(itemId);
        sendResponse({
          ok: true,
          payload: next
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_ITEM) {
        const itemId = message.payload ? message.payload.itemId : null;
        const item = await refreshWatchlistItem(itemId, "manual");
        sendResponse({
          ok: true,
          payload: item
        });
        return;
      }

      if (message && message.type === Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_BATCH) {
        const limit = message.payload ? message.payload.limit : null;
        const results = await refreshBatch(limit, "popup-batch");
        sendResponse({
          ok: true,
          payload: results
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
