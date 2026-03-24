(function initPopup(globalScope) {
  const { Constants, Utils, I18n } = globalScope.AvtoFair;
  const t = (key, vars) => I18n ? I18n.t(key, vars) : key;
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

  function setLanguage(lang) {
    if (I18n) {
      I18n.setLang(lang || "en");
    }
  }

  function renderStaticText() {
    document.getElementById("hero-subtitle").textContent = t("appSubtitle");
    document.getElementById("current-page-eyebrow").textContent = t("currentPage");
    document.getElementById("listing-summary-title").textContent = t("listingSummary");
    document.getElementById("watchlist-eyebrow").textContent = t("watchlist");
    document.getElementById("saved-cars-title").textContent = t("savedCars");
    document.getElementById("settings-eyebrow").textContent = t("settings");
    document.getElementById("extension-controls-title").textContent = t("extensionControls");
    document.getElementById("label-show-panel").textContent = t("showFloatingPanel");
    document.getElementById("label-auto-run").textContent = t("autoRunAnalysis");
    document.getElementById("label-notifications").textContent = t("priceDropNotifications");
    document.getElementById("label-default-collapsed").textContent = t("defaultCollapsedPanel");
    document.getElementById("label-compact-panel").textContent = t("compactPanelMode");
    document.getElementById("label-remember-position").textContent = t("rememberPanelPosition");
    document.getElementById("label-auto-refresh").textContent = t("refreshSavedItemsOnPopupOpen");
    document.getElementById("label-density").textContent = t("watchlistDensity");
    document.getElementById("density-detailed").textContent = t("detailed");
    document.getElementById("density-compact").textContent = t("compact");
    document.getElementById("built-by").textContent = t("builtBy");
    document.getElementById("support-text").textContent = t("supportText");
    dom.supportBtn.textContent = t("supportButton");
    dom.refreshCurrentBtn.textContent = t("refresh");
    dom.refreshWatchlistBtn.textContent = t("refreshAll");
    dom.heroPill.textContent = dashboardMode ? t("dashboard") : t("panelFirst");
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

  function historyText(item) {
    const event = item.history?.priceEvents?.[item.history.priceEvents.length - 1];
    if (!event) {
      return t("noChangeHistoryYet");
    }
    if (event.type === "drop") {
      return t("droppedFromTo", {
        oldPrice: Utils.formatPrice(event.oldPrice, item.currency),
        newPrice: Utils.formatPrice(event.newPrice, item.currency)
      });
    }
    if (event.type === "increase") {
      return t("increasedFromTo", {
        oldPrice: Utils.formatPrice(event.oldPrice, item.currency),
        newPrice: Utils.formatPrice(event.newPrice, item.currency)
      });
    }
    if (event.type === "unavailable") {
      return t("listingCurrentlyUnavailable");
    }
    return t("priceUnchanged");
  }

  function getVerdictLabel(verdict) {
    const keys = {
      "great-deal": "greatDeal",
      "good-price": "goodPrice",
      "fair-price": "fairPrice",
      "slightly-overpriced": "slightlyOverpriced",
      "overpriced": "overpriced",
      "insufficient-data": "noResult"
    };
    return t(keys[verdict] || "noResult");
  }

  function getConfidenceLabel(confidence) {
    if (confidence === "high") return t("highConfidence");
    if (confidence === "medium") return t("mediumConfidence");
    return t("lowConfidence");
  }

  function getScoreBandLabel(label) {
    return I18n ? I18n.translateScoreBandLabel(label) : label;
  }

  function buildCurrentSummary(listing, analysis) {
    if (!listing?.price) {
      return t("mainMsgCannotReadPrice");
    }

    if (analysis.deviationPercent === null || analysis.deviationPercent === undefined) {
      return t("noResult");
    }

    const rounded = Math.abs(Math.round(analysis.deviationPercent));
    if (analysis.isFallbackEstimate) {
      return t("mainMsgFallback", {
        percent: rounded,
        direction: analysis.deviationPercent <= 0 ? t("below") : t("above")
      });
    }
    if (analysis.deviationPercent <= -8) {
      return t("mainMsgMuchCheaper", { percent: rounded });
    }
    if (analysis.deviationPercent < -3) {
      return t("mainMsgBitCheaper");
    }
    if (analysis.deviationPercent <= 3) {
      return t("mainMsgClose");
    }
    if (analysis.deviationPercent < 8) {
      return t("mainMsgBitMoreExpensive");
    }
    return t("mainMsgMuchMoreExpensive", { percent: rounded });
  }

  function buildCurrentBullets(listing, analysis) {
    const bullets = [];

    if (analysis.marketBlockMessage) {
      bullets.push(analysis.marketBlockMessage);
      bullets.push(t("reasonTryRefresh"));
      return bullets.slice(0, 3);
    }

    if (analysis.positiveSignals?.length) {
      bullets.push(I18n.translateSignalLabel(analysis.positiveSignals[0].label));
    }

    if (analysis.riskFlags?.length) {
      bullets.push(I18n.translateSignalLabel(analysis.riskFlags[0]));
    }

    if (analysis.comparableCount) {
      bullets.push(`${analysis.comparableCount} ${t("comparables").toLowerCase()}`);
    }

    if (!bullets.length) {
      bullets.push(buildCurrentSummary(listing, analysis));
    }

    return bullets.slice(0, 3);
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
          <h3>${Utils.escapeHtml(t("openAvtoNetListing"))}</h3>
          <p>${Utils.escapeHtml(t("popupEmptyHint"))}</p>
        </div>
      `;
      return;
    }

    if (!context.listing.available) {
      dom.currentContent.innerHTML = `
        <div class="empty-state">
          <h3>${Utils.escapeHtml(t("listingUnavailableTitle"))}</h3>
          <p>${Utils.escapeHtml(context.listing.summary || t("currentPageUnavailableFallback"))}</p>
        </div>
      `;
      return;
    }

    if (!context.analysis) {
      dom.currentContent.innerHTML = `
        <div class="empty-state">
          <h3>${Utils.escapeHtml(t("analysisStillLoading"))}</h3>
          <p>${Utils.escapeHtml(t("analysisLoadingHint"))}</p>
        </div>
      `;
      return;
    }

    const listing = context.listing;
    const analysis = context.analysis;
    const verdict = verdictMeta(analysis.verdict);
    const bullets = buildCurrentBullets(listing, analysis);

    dom.currentContent.innerHTML = `
      <article class="current-card">
        <div class="current-top">
          <div>
            <div class="badge badge--${verdict.accent}">${Utils.escapeHtml(getVerdictLabel(analysis.verdict))}</div>
            <h3>${Utils.escapeHtml(listing.title || "Avto.net listing")}</h3>
            <p>${Utils.escapeHtml(buildCurrentSummary(listing, analysis))}</p>
          </div>
          <div class="score-orb">
            <span>${Utils.escapeHtml(t("score"))}</span>
            <strong>${analysis.dealScore ?? "--"}</strong>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-box">
            <span>${Utils.escapeHtml(t("listed"))}</span>
            <strong>${Utils.escapeHtml(Utils.formatPrice(listing.price, listing.currency, popupState.settings.currencyFormat))}</strong>
          </div>
          <div class="stat-box">
            <span>${Utils.escapeHtml(t("fairEstimate"))}</span>
            <strong>${Utils.escapeHtml(Utils.formatPrice(analysis.fairPrice, listing.currency, popupState.settings.currencyFormat))}</strong>
          </div>
          <div class="stat-box">
            <span>${Utils.escapeHtml(t("confidence"))}</span>
            <strong>${Utils.escapeHtml(getConfidenceLabel(analysis.confidence))}</strong>
          </div>
          <div class="stat-box">
            <span>${Utils.escapeHtml(t("band"))}</span>
            <strong>${Utils.escapeHtml(getScoreBandLabel(analysis.scoreBandLabel || t("score")))}</strong>
          </div>
        </div>
        <ul class="mini-bullets">
          ${bullets.map((bullet) => `<li>${Utils.escapeHtml(bullet)}</li>`).join("")}
        </ul>
        <div class="inline-actions">
          <button class="primary-btn" type="button" id="save-current-btn">${Utils.escapeHtml(context.savedItem ? t("saved") : t("saveToWatchlist"))}</button>
          <button class="ghost-btn" type="button" id="open-current-btn">${Utils.escapeHtml(t("openListingBtn"))}</button>
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
          <h3>${Utils.escapeHtml(t("noSavedCarsYet"))}</h3>
          <p>${Utils.escapeHtml(t("noSavedCarsHint"))}</p>
        </div>
      `;
      return;
    }

    dom.watchlistContent.innerHTML = popupState.watchlist.map((item) => {
      const verdict = verdictMeta(item.analysis?.verdict);
      return `
        <article class="watch-card" data-item-id="${Utils.escapeHtml(item.id)}">
          <div class="watch-media" style="${item.imageUrl ? `background-image:url('${Utils.escapeHtml(item.imageUrl)}')` : ""}">
            <span class="badge badge--${verdict.accent}">${Utils.escapeHtml(getVerdictLabel(item.analysis?.verdict || "insufficient-data"))}</span>
          </div>
          <div class="watch-copy">
            <h3>${Utils.escapeHtml(item.title)}</h3>
            <p>${Utils.escapeHtml(historyText(item))}</p>
            <div class="watch-meta">
              <span>${Utils.escapeHtml(Utils.formatPrice(item.currentPrice, item.currency, popupState.settings.currencyFormat))}</span>
              <span>${item.analysis?.dealScore ?? "--"} ${Utils.escapeHtml(t("score").toLowerCase())}</span>
              <span>${Utils.escapeHtml(getScoreBandLabel(item.analysis?.scoreBandLabel || ""))}</span>
            </div>
          </div>
          <div class="watch-actions">
            <button class="mini-btn" type="button" data-action="open">${Utils.escapeHtml(t("open"))}</button>
            <button class="mini-btn" type="button" data-action="refresh">${Utils.escapeHtml(t("refresh"))}</button>
            <button class="mini-btn mini-btn--danger" type="button" data-action="remove">${Utils.escapeHtml(t("remove"))}</button>
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
    if (!popupState.activeTab?.id || !popupState.activeTab.url || !/(avto\.net|mobile\.de)/i.test(popupState.activeTab.url)) {
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
      setStatus(t("activeTabNotReady"), true);
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
    setLanguage(popupState.settings.language);
    renderStaticText();
    syncSettingsControls();
    renderCurrentPage();
    renderWatchlist();
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
    setLanguage(popupState.settings.language);
    syncSettingsControls();
    renderStaticText();
    renderCurrentPage();
    renderWatchlist();
  }

  async function onSaveCurrent() {
    if (!popupState.currentPage?.listing || !popupState.currentPage?.analysis) {
      setStatus(t("noCurrentAnalysisToSave"), true);
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
      setStatus(response?.error || t("saveFailed"), true);
      return;
    }

    popupState.currentPage.savedItem = response.payload.item;
    renderCurrentPage();
    await loadWatchlist();
    setStatus(response.payload.existed ? t("listingUpdatedInWatchlist") : t("listingSavedToWatchlist"));
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
        setStatus(t("removedFromWatchlist"));
      } else if (action === "refresh") {
        setStatus(t("refreshingSavedListing"));
        await runtimeSend({
          type: Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_ITEM,
          payload: { itemId }
        });
        await loadWatchlist();
        setStatus(t("savedListingRefreshed"));
      }
    } catch (error) {
      setStatus(error.message || t("actionFailed"), true);
    } finally {
      button.disabled = false;
    }
  }

  async function refreshAllWatchlist() {
    setStatus(t("refreshingWatchlist"));
    await runtimeSend({
      type: Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_BATCH,
      payload: {
        limit: popupState.watchlist.length
      }
    });
    await loadWatchlist();
    setStatus(t("watchlistRefreshFinished"));
  }

  function attachEvents() {
    dom.refreshCurrentBtn.addEventListener("click", () => {
      loadCurrentPage(true).catch((error) => {
        setStatus(error.message || t("refreshFailed"), true);
      });
    });

    dom.refreshWatchlistBtn.addEventListener("click", () => {
      refreshAllWatchlist().catch((error) => {
        setStatus(error.message || t("refreshFailed"), true);
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
        setLanguage(popupState.settings.language);
        syncSettingsControls();
        renderStaticText();
        renderCurrentPage();
        renderWatchlist();
      }
    });
  }

  async function init() {
    document.body.dataset.mode = dashboardMode ? "dashboard" : "popup";

    attachEvents();
    await Promise.all([
      loadSettings(),
      loadWatchlist(),
      loadCurrentPage(false)
    ]);
    renderStaticText();
    renderCurrentPage();
    renderWatchlist();

    if (popupState.settings.autoRefreshOnPopupOpen && popupState.watchlist.length) {
      refreshAllWatchlist().catch(() => {
        // Silent refresh failure is acceptable in the secondary dashboard.
      });
    }
  }

  init().catch((error) => {
    setStatus(error.message || t("popupInitFailed"), true);
  });
}(globalThis));
