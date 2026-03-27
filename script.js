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
    openDashboardBtn: document.getElementById("open-dashboard-btn"),
    statusBar: document.getElementById("status-bar"),
    supportBtn: document.getElementById("support-btn"),
    heroPill: document.getElementById("hero-pill"),
    themeToggleBtn: document.getElementById("theme-toggle-btn"),
    themeIconSun: document.getElementById("theme-icon-sun"),
    themeIconMoon: document.getElementById("theme-icon-moon"),
    metricWatchlistCount: document.getElementById("metric-watchlist-count"),
    metricThemeMode: document.getElementById("metric-theme-mode"),
    metricRefreshMode: document.getElementById("metric-refresh-mode"),
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

  function normalizeTheme(theme) {
    return theme === "light" ? "light" : "dark";
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

  function escape(value) {
    return Utils.escapeHtml(value == null ? "" : String(value));
  }

  function metricRefreshLabel() {
    return popupState.settings.autoRefreshOnPopupOpen ? "Auto" : "Manual";
  }

  function metricThemeLabel() {
    return normalizeTheme(popupState.settings.themeMode) === "light" ? "Light" : "Dark";
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
    dom.openDashboardBtn.textContent = t("openDashboard");
    dom.heroPill.textContent = dashboardMode ? t("dashboard") : t("panelFirst");
    dom.openDashboardBtn.hidden = dashboardMode;
  }

  function updateMetrics() {
    dom.metricWatchlistCount.textContent = String(popupState.watchlist.length);
    dom.metricThemeMode.textContent = metricThemeLabel();
    dom.metricRefreshMode.textContent = metricRefreshLabel();
  }

  function applyTheme(theme) {
    const nextTheme = normalizeTheme(theme);
    document.body.dataset.theme = nextTheme;

    if (dom.themeIconSun) dom.themeIconSun.style.display = nextTheme === "light" ? "" : "none";
    if (dom.themeIconMoon) dom.themeIconMoon.style.display = nextTheme === "light" ? "none" : "";

    if (dom.themeToggleBtn) {
      const nextLabel = nextTheme === "light" ? "Dark mode" : "Light mode";
      dom.themeToggleBtn.title = nextLabel;
      dom.themeToggleBtn.setAttribute("aria-label", nextLabel);
    }
  }

  function historyText(item) {
    const priceEvents = Array.isArray(item.history?.priceEvents) ? item.history.priceEvents : [];
    const event = priceEvents[priceEvents.length - 1];

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

  function verdictMeta(verdict) {
    return Constants.VERDICTS[verdict] || Constants.VERDICTS["insufficient-data"];
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

  function renderEmptyState(label, title, description) {
    return `
      <div class="empty-state">
        <div class="empty-state-label">${escape(label)}</div>
        <h3>${escape(title)}</h3>
        <p>${escape(description)}</p>
      </div>
    `;
  }

  function renderCurrentPage() {
    if (dashboardMode) {
      dom.currentPanel.hidden = true;
      return;
    }

    dom.currentPanel.hidden = false;

    const context = popupState.currentPage;
    if (!context || !context.listing?.supported || !context.listing?.isListingPage) {
      dom.currentContent.innerHTML = renderEmptyState(
        t("priceCheck"),
        t("openAvtoNetListing"),
        t("popupEmptyHint")
      );
      return;
    }

    if (!context.listing.available) {
      dom.currentContent.innerHTML = renderEmptyState(
        t("currentPage"),
        t("listingUnavailableTitle"),
        context.listing.summary || t("currentPageUnavailableFallback")
      );
      return;
    }

    if (!context.analysis) {
      dom.currentContent.innerHTML = renderEmptyState(
        t("checking"),
        t("analysisStillLoading"),
        t("analysisLoadingHint")
      );
      return;
    }

    const listing = context.listing;
    const analysis = context.analysis;
    const verdict = verdictMeta(analysis.verdict);
    const bullets = buildCurrentBullets(listing, analysis);

    dom.currentContent.innerHTML = `
      <article class="listing-card">
        <div class="listing-head">
          <div class="listing-copy">
            <div class="verdict-pill verdict-pill--${escape(verdict.accent)}">${escape(getVerdictLabel(analysis.verdict))}</div>
            <h3>${escape(listing.title || "Avto.net listing")}</h3>
            <p>${escape(buildCurrentSummary(listing, analysis))}</p>
          </div>
          <div class="score-shell">
            <div>
              <span>${escape(t("score"))}</span>
              <strong>${analysis.dealScore ?? "--"}</strong>
            </div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-stat">
            <span>${escape(t("listed"))}</span>
            <strong>${escape(Utils.formatPrice(listing.price, listing.currency, popupState.settings.currencyFormat))}</strong>
          </div>
          <div class="meta-stat">
            <span>${escape(t("fairEstimate"))}</span>
            <strong>${escape(Utils.formatPrice(analysis.fairPrice, listing.currency, popupState.settings.currencyFormat))}</strong>
          </div>
          <div class="meta-stat">
            <span>${escape(t("confidence"))}</span>
            <strong>${escape(getConfidenceLabel(analysis.confidence))}</strong>
          </div>
          <div class="meta-stat">
            <span>${escape(t("band"))}</span>
            <strong>${escape(getScoreBandLabel(analysis.scoreBandLabel || t("score")))}</strong>
          </div>
        </div>

        <ul class="insight-list">
          ${bullets.map((bullet) => `<li>${escape(bullet)}</li>`).join("")}
        </ul>

        <div class="action-row">
          <button class="primary-button" type="button" id="save-current-btn">${escape(context.savedItem ? t("saved") : t("saveToWatchlist"))}</button>
          <button class="secondary-button" type="button" id="open-current-btn">${escape(t("openListingBtn"))}</button>
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

  function visibleWatchlistItems() {
    if (dashboardMode) {
      return popupState.watchlist;
    }
    return popupState.watchlist.slice(0, 3);
  }

  function renderWatchlist() {
    document.body.dataset.density = popupState.settings.watchlistDensity;
    updateMetrics();

    if (!popupState.watchlist.length) {
      dom.watchlistContent.innerHTML = renderEmptyState(
        t("watchlist"),
        t("noSavedCarsYet"),
        t("noSavedCarsHint")
      );
      return;
    }

    dom.watchlistContent.innerHTML = visibleWatchlistItems().map((item) => {
      const verdict = verdictMeta(item.analysis?.verdict);

      return `
        <article class="watch-card" data-item-id="${escape(item.id)}">
          <div class="watch-media">
            ${item.imageUrl ? `<img class="watch-thumb" src="${escape(item.imageUrl)}" alt="${escape(item.title)}">` : ""}
            <span class="watch-pill verdict-pill--${escape(verdict.accent)}">${escape(getVerdictLabel(item.analysis?.verdict || "insufficient-data"))}</span>
          </div>

          <div class="watch-body">
            <h3>${escape(item.title)}</h3>
            <p>${escape(historyText(item))}</p>

            <div class="watch-meta">
              <span class="meta-chip">${escape(Utils.formatPrice(item.currentPrice, item.currency, popupState.settings.currencyFormat))}</span>
              <span class="meta-chip">${item.analysis?.dealScore ?? "--"} ${escape(t("score").toLowerCase())}</span>
              <span class="meta-chip">${escape(getScoreBandLabel(item.analysis?.scoreBandLabel || ""))}</span>
            </div>

            <div class="watch-actions">
              <button class="watch-action" type="button" data-action="open">${escape(t("open"))}</button>
              <button class="watch-action" type="button" data-action="refresh">${escape(t("refresh"))}</button>
              <button class="watch-action watch-action--danger" type="button" data-action="remove">${escape(t("remove"))}</button>
            </div>
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
      setStatus("");
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

  function syncSettingsControls() {
    dom.showPanel.checked = popupState.settings.showFloatingPanel;
    dom.autoRun.checked = popupState.settings.autoRunAnalysis;
    dom.notifications.checked = popupState.settings.notificationsEnabled;
    dom.defaultCollapsed.checked = popupState.settings.defaultCollapsed;
    dom.compactPanel.checked = popupState.settings.compactMode;
    dom.rememberPosition.checked = popupState.settings.rememberPanelPosition;
    dom.autoRefresh.checked = popupState.settings.autoRefreshOnPopupOpen;
    dom.density.value = popupState.settings.watchlistDensity;
    applyTheme(normalizeTheme(popupState.settings.themeMode));
    updateMetrics();
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

  async function openDashboard() {
    try {
      const response = await runtimeSend({
        type: Constants.MESSAGE_TYPES.OPEN_DASHBOARD
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Dashboard failed to open.");
      }
    } catch (error) {
      chrome.tabs.create({
        url: chrome.runtime.getURL("popup.html?dashboard=1"),
        active: true
      });
    }
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

    dom.openDashboardBtn.addEventListener("click", () => {
      openDashboard().catch((error) => {
        setStatus(error.message || t("actionFailed"), true);
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

    dom.themeToggleBtn?.addEventListener("click", () => {
      const next = normalizeTheme(popupState.settings.themeMode) === "light" ? "dark" : "light";
      updateSetting({ themeMode: next }).catch((error) => setStatus(error.message, true));
    });

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
    document.documentElement.dataset.mode = dashboardMode ? "dashboard" : "popup";

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
        // Silent refresh failure is acceptable when the popup opens.
      });
    }
  }

  init().catch((error) => {
    setStatus(error.message || t("popupInitFailed"), true);
  });
}(globalThis));
