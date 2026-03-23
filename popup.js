(function initPopup(globalScope) {
  const { Constants, Utils } = globalScope.AvtoFair;
  const searchParams = new URLSearchParams(globalScope.location.search);
  const dashboardMode = searchParams.get("dashboard") === "1";

  const dom = {
    currentPanel: document.getElementById("current-panel"),
    currentContent: document.getElementById("current-content"),
    watchlistContent: document.getElementById("watchlist-content"),
    refreshCurrentBtn: document.getElementById("refresh-current-btn"),
    refreshWatchlistBtn: document.getElementById("refresh-watchlist-btn"),
    statusBar: document.getElementById("status-bar"),
    supportBtn: document.getElementById("support-btn"),
    heroPill: document.getElementById("hero-pill"),
    showPanel: document.getElementById("setting-show-panel"),
    autoRun: document.getElementById("setting-auto-run"),
    notifications: document.getElementById("setting-notifications"),
    defaultCollapsed: document.getElementById("setting-default-collapsed"),
    compactPanel: document.getElementById("setting-compact-panel"),
    rememberPosition: document.getElementById("setting-remember-position"),
    autoRefresh: document.getElementById("setting-auto-refresh"),
    density: document.getElementById("setting-density")
  };

  const popupState = {
    settings: Constants.DEFAULT_SETTINGS,
    watchlist: [],
    currentPage: null,
    activeTab: null
  };

  function setStatus(message, isError) {
    dom.statusBar.textContent = message || "";
    dom.statusBar.dataset.error = isError ? "true" : "false";
  }

  function runtimeSend(message) {
    return chrome.runtime.sendMessage(message);
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    return tabs[0] || null;
  }

  async function sendToActiveTab(message) {
    if (!popupState.activeTab?.id) {
      throw new Error("No active tab available.");
    }
    return chrome.tabs.sendMessage(popupState.activeTab.id, message);
  }

  function verdictMeta(verdict) {
    return Constants.VERDICTS[verdict || "insufficient-data"] || Constants.VERDICTS["insufficient-data"];
  }

  function historyText(item) {
    const event = item.history?.priceEvents?.[item.history.priceEvents.length - 1];
    if (!event) {
      return "No change history yet.";
    }
    if (event.type === "drop") {
      return `Dropped from ${Utils.formatPrice(event.oldPrice, item.currency)} to ${Utils.formatPrice(event.newPrice, item.currency)}`;
    }
    if (event.type === "increase") {
      return `Increased from ${Utils.formatPrice(event.oldPrice, item.currency)} to ${Utils.formatPrice(event.newPrice, item.currency)}`;
    }
    if (event.type === "unavailable") {
      return "Listing currently unavailable.";
    }
    return "Price unchanged.";
  }

  function renderCurrentPage() {
    if (dashboardMode) {
      dom.currentPanel.hidden = true;
      return;
    }

    const context = popupState.currentPage;
    if (!context || !context.listing?.supported || !context.listing?.isListingPage) {
      dom.currentContent.innerHTML = `
        <div class="empty-state">
          <h3>Open an Avto.net car listing</h3>
          <p>The floating panel will do the main work automatically. The popup is here for a quick summary and saved cars.</p>
        </div>
      `;
      return;
    }

    if (!context.listing.available) {
      dom.currentContent.innerHTML = `
        <div class="empty-state">
          <h3>Listing unavailable</h3>
          <p>${Utils.escapeHtml(context.listing.summary || "This listing appears unavailable.")}</p>
        </div>
      `;
      return;
    }

    if (!context.analysis) {
      dom.currentContent.innerHTML = `
        <div class="empty-state">
          <h3>Analysis still loading</h3>
          <p>The on-page panel will refresh automatically when enough listing content is available.</p>
        </div>
      `;
      return;
    }

    const listing = context.listing;
    const analysis = context.analysis;
    const verdict = verdictMeta(analysis.verdict);

    dom.currentContent.innerHTML = `
      <article class="current-card">
        <div class="current-top">
          <div>
            <div class="badge badge--${verdict.accent}">${Utils.escapeHtml(verdict.label)}</div>
            <h3>${Utils.escapeHtml(listing.title || "Avto.net listing")}</h3>
            <p>${Utils.escapeHtml(analysis.summary)}</p>
          </div>
          <div class="score-orb">
            <span>Score</span>
            <strong>${analysis.dealScore ?? "--"}</strong>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-box">
            <span>Listed</span>
            <strong>${Utils.escapeHtml(Utils.formatPrice(listing.price, listing.currency, popupState.settings.currencyFormat))}</strong>
          </div>
          <div class="stat-box">
            <span>Fair estimate</span>
            <strong>${Utils.escapeHtml(Utils.formatPrice(analysis.fairPrice, listing.currency, popupState.settings.currencyFormat))}</strong>
          </div>
          <div class="stat-box">
            <span>Confidence</span>
            <strong>${Utils.escapeHtml(Constants.CONFIDENCE[analysis.confidence].label)}</strong>
          </div>
          <div class="stat-box">
            <span>Band</span>
            <strong>${Utils.escapeHtml(analysis.scoreBandLabel || "Deal score")}</strong>
          </div>
        </div>
        <ul class="mini-bullets">
          ${(analysis.explanationBullets || []).slice(0, 3).map((bullet) => `<li>${Utils.escapeHtml(bullet)}</li>`).join("")}
        </ul>
        <div class="inline-actions">
          <button class="primary-btn" type="button" id="save-current-btn">${context.savedItem ? "Saved" : "Save to watchlist"}</button>
          <button class="ghost-btn" type="button" id="open-current-btn">Open listing</button>
        </div>
      </article>
    `;

    document.getElementById("save-current-btn")?.addEventListener("click", onSaveCurrent);
    document.getElementById("open-current-btn")?.addEventListener("click", () => {
      if (popupState.activeTab?.url) {
        chrome.tabs.create({ url: popupState.activeTab.url, active: true });
      }
    });
  }

  function renderWatchlist() {
    document.body.dataset.density = popupState.settings.watchlistDensity;

    if (!popupState.watchlist.length) {
      dom.watchlistContent.innerHTML = `
        <div class="empty-state">
          <h3>No saved cars yet</h3>
          <p>Save strong candidates from the floating panel, then monitor price drops and score changes here.</p>
        </div>
      `;
      return;
    }

    dom.watchlistContent.innerHTML = popupState.watchlist.map((item) => {
      const verdict = verdictMeta(item.analysis?.verdict);
      return `
        <article class="watch-card" data-item-id="${Utils.escapeHtml(item.id)}">
          <div class="watch-media" style="${item.imageUrl ? `background-image:url('${Utils.escapeHtml(item.imageUrl)}')` : ""}">
            <span class="badge badge--${verdict.accent}">${Utils.escapeHtml(verdict.shortLabel)}</span>
          </div>
          <div class="watch-copy">
            <h3>${Utils.escapeHtml(item.title)}</h3>
            <p>${Utils.escapeHtml(historyText(item))}</p>
            <div class="watch-meta">
              <span>${Utils.escapeHtml(Utils.formatPrice(item.currentPrice, item.currency, popupState.settings.currencyFormat))}</span>
              <span>${item.analysis?.dealScore ?? "--"} score</span>
              <span>${item.analysis?.scoreBandLabel || "Deal"}</span>
            </div>
          </div>
          <div class="watch-actions">
            <button class="mini-btn" type="button" data-action="open">Open</button>
            <button class="mini-btn" type="button" data-action="refresh">Refresh</button>
            <button class="mini-btn mini-btn--danger" type="button" data-action="remove">Remove</button>
          </div>
        </article>
      `;
    }).join("");
  }

  async function loadCurrentPage(force) {
    if (dashboardMode) {
      return;
    }

    popupState.activeTab = await getActiveTab();
    if (!popupState.activeTab?.id || !popupState.activeTab.url || !/avto\.net/i.test(popupState.activeTab.url)) {
      popupState.currentPage = null;
      renderCurrentPage();
      return;
    }

    try {
      let response = await sendToActiveTab({
        type: Constants.MESSAGE_TYPES.GET_PAGE_CONTEXT
      });

      if (force || !response?.payload?.analysis) {
        response = await sendToActiveTab({
          type: Constants.MESSAGE_TYPES.ANALYZE_PAGE,
          payload: {
            force: true,
            reason: "popup"
          }
        });
      }

      popupState.currentPage = response?.payload || null;
    } catch (error) {
      popupState.currentPage = null;
      setStatus("The active tab is not ready for analysis yet.", true);
    }

    renderCurrentPage();
  }

  async function loadWatchlist() {
    const response = await runtimeSend({
      type: Constants.MESSAGE_TYPES.GET_WATCHLIST
    });

    popupState.watchlist = response?.payload || [];
    renderWatchlist();
  }

  async function loadSettings() {
    const response = await runtimeSend({
      type: Constants.MESSAGE_TYPES.GET_SETTINGS
    });

    popupState.settings = Object.assign({}, Constants.DEFAULT_SETTINGS, response?.payload || {});
    syncSettingsControls();
  }

  function syncSettingsControls() {
    dom.showPanel.checked = popupState.settings.showFloatingPanel;
    dom.autoRun.checked = popupState.settings.autoRunAnalysis;
    dom.notifications.checked = popupState.settings.notificationsEnabled;
    dom.defaultCollapsed.checked = popupState.settings.defaultCollapsed;
    dom.compactPanel.checked = popupState.settings.compactMode;
    dom.rememberPosition.checked = popupState.settings.rememberPanelPosition;
    dom.autoRefresh.checked = popupState.settings.autoRefreshOnPopupOpen;
    dom.density.value = popupState.settings.watchlistDensity;
  }

  async function updateSetting(patch) {
    const response = await runtimeSend({
      type: Constants.MESSAGE_TYPES.UPDATE_SETTINGS,
      payload: patch
    });
    popupState.settings = Object.assign({}, Constants.DEFAULT_SETTINGS, response?.payload || {});
    syncSettingsControls();
    renderWatchlist();
  }

  async function onSaveCurrent() {
    if (!popupState.currentPage?.listing || !popupState.currentPage?.analysis) {
      setStatus("No current analysis to save.", true);
      return;
    }

    const response = await runtimeSend({
      type: Constants.MESSAGE_TYPES.SAVE_ANALYSIS,
      payload: {
        listing: popupState.currentPage.listing,
        analysis: popupState.currentPage.analysis
      }
    });

    if (!response?.ok) {
      setStatus(response?.error || "Save failed.", true);
      return;
    }

    popupState.currentPage.savedItem = response.payload.item;
    renderCurrentPage();
    await loadWatchlist();
    setStatus(response.payload.existed ? "Listing updated in your watchlist." : "Listing saved to your watchlist.");
  }

  async function onWatchlistAction(event) {
    const button = event.target.closest("[data-action]");
    const card = event.target.closest("[data-item-id]");
    if (!button || !card) {
      return;
    }

    const itemId = card.dataset.itemId;
    const item = popupState.watchlist.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    const action = button.dataset.action;
    button.disabled = true;

    try {
      if (action === "open") {
        chrome.tabs.create({ url: item.url, active: true });
      } else if (action === "remove") {
        await runtimeSend({
          type: Constants.MESSAGE_TYPES.REMOVE_WATCHLIST_ITEM,
          payload: { itemId }
        });
        await loadWatchlist();
        setStatus("Removed from watchlist.");
      } else if (action === "refresh") {
        setStatus("Refreshing saved listing...");
        await runtimeSend({
          type: Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_ITEM,
          payload: { itemId }
        });
        await loadWatchlist();
        setStatus("Saved listing refreshed.");
      }
    } catch (error) {
      setStatus(error.message || "Action failed.", true);
    } finally {
      button.disabled = false;
    }
  }

  async function refreshAllWatchlist() {
    setStatus("Refreshing watchlist in the background...");
    await runtimeSend({
      type: Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_BATCH,
      payload: {
        limit: popupState.watchlist.length
      }
    });
    await loadWatchlist();
    setStatus("Watchlist refresh finished.");
  }

  function attachEvents() {
    dom.refreshCurrentBtn.addEventListener("click", () => {
      loadCurrentPage(true).catch((error) => {
        setStatus(error.message || "Refresh failed.", true);
      });
    });

    dom.refreshWatchlistBtn.addEventListener("click", () => {
      refreshAllWatchlist().catch((error) => {
        setStatus(error.message || "Refresh failed.", true);
      });
    });

    dom.watchlistContent.addEventListener("click", onWatchlistAction);

    dom.supportBtn.addEventListener("click", () => {
      chrome.tabs.create({
        url: Constants.SUPPORT_URL,
        active: true
      });
    });

    dom.showPanel.addEventListener("change", () => updateSetting({ showFloatingPanel: dom.showPanel.checked }).catch((error) => setStatus(error.message, true)));
    dom.autoRun.addEventListener("change", () => updateSetting({ autoRunAnalysis: dom.autoRun.checked }).catch((error) => setStatus(error.message, true)));
    dom.notifications.addEventListener("change", () => updateSetting({ notificationsEnabled: dom.notifications.checked }).catch((error) => setStatus(error.message, true)));
    dom.defaultCollapsed.addEventListener("change", () => updateSetting({ defaultCollapsed: dom.defaultCollapsed.checked }).catch((error) => setStatus(error.message, true)));
    dom.compactPanel.addEventListener("change", () => updateSetting({ compactMode: dom.compactPanel.checked }).catch((error) => setStatus(error.message, true)));
    dom.rememberPosition.addEventListener("change", () => updateSetting({ rememberPanelPosition: dom.rememberPosition.checked }).catch((error) => setStatus(error.message, true)));
    dom.autoRefresh.addEventListener("change", () => updateSetting({ autoRefreshOnPopupOpen: dom.autoRefresh.checked }).catch((error) => setStatus(error.message, true)));
    dom.density.addEventListener("change", () => updateSetting({ watchlistDensity: dom.density.value }).catch((error) => setStatus(error.message, true)));

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (changes[Constants.STORAGE_KEYS.WATCHLIST]) {
        popupState.watchlist = changes[Constants.STORAGE_KEYS.WATCHLIST].newValue || [];
        renderWatchlist();
      }

      if (changes[Constants.STORAGE_KEYS.SETTINGS]) {
        popupState.settings = Object.assign({}, Constants.DEFAULT_SETTINGS, changes[Constants.STORAGE_KEYS.SETTINGS].newValue || {});
        syncSettingsControls();
        renderWatchlist();
      }
    });
  }

  async function init() {
    document.body.dataset.mode = dashboardMode ? "dashboard" : "popup";
    dom.heroPill.textContent = dashboardMode ? "Dashboard" : "Panel-First";

    attachEvents();
    await Promise.all([
      loadSettings(),
      loadWatchlist(),
      loadCurrentPage(false)
    ]);

    if (popupState.settings.autoRefreshOnPopupOpen && popupState.watchlist.length) {
      refreshAllWatchlist().catch(() => {
        // Silent refresh failure is acceptable in the secondary dashboard.
      });
    }
  }

  init().catch((error) => {
    setStatus(error.message || "Popup failed to initialize.", true);
  });
}(globalThis));
