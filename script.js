(function initPopup(globalScope) {
  const { Constants, Utils, I18n, Presentation, PayPal } = globalScope.AvtoFair;
  const t = (key, vars) => I18n ? I18n.t(key, vars) : key;
  const searchParams = new URLSearchParams(globalScope.location.search);
  const dashboardMode = searchParams.get("dashboard") === "1";

  const dom = {
    currentPanel: document.getElementById("current-panel"),
    currentContent: document.getElementById("current-content"),
    watchlistContent: document.getElementById("watchlist-content"),
    refreshCurrentBtn: document.getElementById("refresh-current-btn"),
    refreshWatchlistBtn: document.getElementById("refresh-watchlist-btn"),
    refreshStaleBtn: document.getElementById("refresh-stale-btn"),
    openDashboardBtn: document.getElementById("open-dashboard-btn"),
    clearFiltersBtn: document.getElementById("clear-filters-btn"),
    watchlistSearch: document.getElementById("watchlist-search"),
    watchlistFilter: document.getElementById("watchlist-filter"),
    watchlistSort: document.getElementById("watchlist-sort"),
    watchlistSummary: document.getElementById("watchlist-summary"),
    watchlistShortcuts: document.getElementById("watchlist-shortcuts"),
    statusBar: document.getElementById("status-bar"),
    supportBtn: document.getElementById("support-btn"),
    heroPill: document.getElementById("hero-pill"),
    themeToggleBtn: document.getElementById("theme-toggle-btn"),
    themeIconSun: document.getElementById("theme-icon-sun"),
    themeIconMoon: document.getElementById("theme-icon-moon"),
    metricWatchlistCount: document.getElementById("metric-watchlist-count"),
    metricDealCount: document.getElementById("metric-deal-count"),
    metricDropCount: document.getElementById("metric-drop-count"),
    metricAttentionCount: document.getElementById("metric-attention-count"),
    showPanel: document.getElementById("setting-show-panel"),
    autoRun: document.getElementById("setting-auto-run"),
    notifications: document.getElementById("setting-notifications"),
    defaultCollapsed: document.getElementById("setting-default-collapsed"),
    compactPanel: document.getElementById("setting-compact-panel"),
    rememberPosition: document.getElementById("setting-remember-position"),
    autoRefresh: document.getElementById("setting-auto-refresh"),
    cloudSync: document.getElementById("setting-cloud-sync"),
    density: document.getElementById("setting-density"),
    syncStatusCopy: document.getElementById("sync-status-copy"),
    syncNowBtn: document.getElementById("sync-now-btn"),
    exportBtn: document.getElementById("export-btn"),
    importBtn: document.getElementById("import-btn"),
    importFileInput: document.getElementById("import-file-input")
  };

  const popupState = {
    settings: Constants.DEFAULT_SETTINGS,
    watchlist: [],
    currentPage: null,
    activeTab: null,
    syncStatus: {
      lastSyncedAt: null,
      lastError: null
    },
    filters: {
      query: "",
      filter: "all",
      sort: "recommended"
    },
    loading: {
      current: false,
      watchlist: false,
      sync: false
    },
    busy: {
      refreshCurrent: false,
      saveCurrent: false,
      refreshAll: false,
      refreshStale: false,
      syncNow: false,
      exportData: false,
      importData: false,
      itemActions: {}
    },
    statusTimer: null
  };

  function locale() {
    return popupState.settings.currencyFormat || "sl-SI";
  }

  function escape(value) {
    return Utils.escapeHtml(value == null ? "" : String(value));
  }

  function runtimeSend(message) {
    return chrome.runtime.sendMessage(message);
  }

  function supportConfig() {
    return PayPal ? PayPal.getSupportConfig(Constants.SUPPORT_URL) : {
      valid: false,
      url: null
    };
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

  function setLanguage(lang) {
    if (I18n) {
      I18n.setLang(lang || "en");
    }
  }

  function setStatus(message, options) {
    const config = Object.assign({
      error: false,
      autoclear: true
    }, options || {});

    if (popupState.statusTimer) {
      globalScope.clearTimeout(popupState.statusTimer);
      popupState.statusTimer = null;
    }

    dom.statusBar.textContent = message || "";
    dom.statusBar.dataset.error = config.error ? "true" : "false";

    if (message && config.autoclear) {
      popupState.statusTimer = globalScope.setTimeout(() => {
        dom.statusBar.textContent = "";
        dom.statusBar.dataset.error = "false";
        popupState.statusTimer = null;
      }, 4200);
    }
  }

  function applyTheme(theme) {
    const nextTheme = Presentation.normalizeTheme(theme);
    document.body.dataset.theme = nextTheme;

    if (dom.themeIconSun) dom.themeIconSun.style.display = nextTheme === "light" ? "" : "none";
    if (dom.themeIconMoon) dom.themeIconMoon.style.display = nextTheme === "light" ? "none" : "";

    if (dom.themeToggleBtn) {
      const nextLabel = nextTheme === "light" ? "Dark mode" : "Light mode";
      dom.themeToggleBtn.title = nextLabel;
      dom.themeToggleBtn.setAttribute("aria-label", nextLabel);
    }
  }

  function isTypingTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function updateMetrics() {
    const insight = Presentation.getWatchlistInsights(popupState.watchlist);
    dom.metricWatchlistCount.textContent = String(insight.total);
    dom.metricDealCount.textContent = String(insight.goodDeals);
    dom.metricDropCount.textContent = String(insight.priceDrops);
    dom.metricAttentionCount.textContent = String(insight.attention);
  }

  function syncStatusLabel() {
    if (popupState.syncStatus?.lastError) {
      return t("syncFailed", { message: popupState.syncStatus.lastError });
    }
    if (popupState.syncStatus?.lastSyncedAt) {
      return t("syncLastSyncedAt", {
        time: Utils.formatDateTime(popupState.syncStatus.lastSyncedAt, locale())
      });
    }
    return popupState.settings.cloudSyncEnabled ? t("syncEnabledHint") : t("syncLocalOnly");
  }

  function renderStaticText() {
    document.getElementById("hero-subtitle").textContent = t("appSubtitle");
    document.getElementById("current-page-eyebrow").textContent = t("currentPage");
    document.getElementById("listing-summary-title").textContent = t("listingSummary");
    document.getElementById("watchlist-eyebrow").textContent = t("watchlist");
    document.getElementById("saved-cars-title").textContent = t("savedCars");
    document.getElementById("settings-eyebrow").textContent = t("settings");
    document.getElementById("extension-controls-title").textContent = t("extensionControls");
    document.getElementById("metric-label-saved").textContent = t("savedMetric");
    document.getElementById("metric-label-deals").textContent = t("dealsMetric");
    document.getElementById("metric-label-drops").textContent = t("dropsMetric");
    document.getElementById("metric-label-attention").textContent = t("attentionMetric");
    document.getElementById("label-show-panel").textContent = t("showFloatingPanel");
    document.getElementById("label-auto-run").textContent = t("autoRunAnalysis");
    document.getElementById("label-notifications").textContent = t("priceDropNotifications");
    document.getElementById("label-default-collapsed").textContent = t("defaultCollapsedPanel");
    document.getElementById("label-compact-panel").textContent = t("compactPanelMode");
    document.getElementById("label-remember-position").textContent = t("rememberPanelPosition");
    document.getElementById("label-cloud-sync").textContent = t("cloudSync");
    document.getElementById("label-auto-refresh").textContent = t("refreshSavedItemsOnPopupOpen");
    document.getElementById("label-density").textContent = t("watchlistDensity");
    document.getElementById("density-detailed").textContent = t("detailed");
    document.getElementById("density-compact").textContent = t("compact");
    document.getElementById("built-by").textContent = t("builtBy");
    document.getElementById("support-text").textContent = t("supportText");
    document.getElementById("filter-all").textContent = t("allSaved");
    document.getElementById("filter-deals").textContent = t("goodDealsMetricLabel");
    document.getElementById("filter-drops").textContent = t("priceDropsMetricLabel");
    document.getElementById("filter-attention").textContent = t("needAttention");
    document.getElementById("sort-recommended").textContent = t("sortRecommended");
    document.getElementById("sort-score").textContent = t("sortBestScore");
    document.getElementById("sort-recent").textContent = t("sortRecentlyChecked");
    document.getElementById("sort-drop").textContent = t("sortBiggestDrop");
    document.getElementById("sort-risk").textContent = t("sortHighestRisk");
    dom.watchlistSearch.placeholder = t("searchSavedCars");
    dom.clearFiltersBtn.textContent = t("clearFilters");
    dom.watchlistShortcuts.textContent = dashboardMode ? t("keyboardHintSearch") : t("keyboardHintPopup");
    dom.supportBtn.textContent = t("supportButton");
    dom.supportBtn.disabled = !supportConfig().valid;
    dom.supportBtn.title = supportConfig().valid ? supportConfig().url : t("supportUnavailable");
    dom.refreshCurrentBtn.textContent = popupState.busy.refreshCurrent ? t("refreshing") : t("refresh");
    dom.refreshStaleBtn.textContent = popupState.busy.refreshStale ? t("refreshing") : t("refreshStale");
    dom.refreshWatchlistBtn.textContent = popupState.busy.refreshAll ? t("refreshing") : t("refreshAll");
    dom.openDashboardBtn.textContent = t("openDashboard");
    document.getElementById("tools-title").textContent = t("dataToolsTitle");
    dom.syncNowBtn.textContent = popupState.busy.syncNow ? t("refreshing") : t("syncNow");
    dom.exportBtn.textContent = popupState.busy.exportData ? t("refreshing") : t("exportData");
    dom.importBtn.textContent = popupState.busy.importData ? t("refreshing") : t("importData");
    dom.syncStatusCopy.textContent = syncStatusLabel();
    dom.refreshStaleBtn.disabled = popupState.busy.refreshStale || popupState.busy.refreshAll;
    dom.syncNowBtn.disabled = !popupState.settings.cloudSyncEnabled || popupState.busy.syncNow;
    dom.exportBtn.disabled = popupState.busy.exportData;
    dom.importBtn.disabled = popupState.busy.importData;
    dom.heroPill.textContent = dashboardMode ? t("dashboard") : t("panelFirst");
    dom.openDashboardBtn.hidden = dashboardMode;
  }

  function historyText(item) {
    const event = Presentation.getLatestPriceEvent(item);

    if (!event) {
      return t("noChangeHistoryYet");
    }

    if (event.type === "drop") {
      return t("droppedFromTo", {
        oldPrice: Utils.formatPrice(event.oldPrice, item.currency, locale()),
        newPrice: Utils.formatPrice(event.newPrice, item.currency, locale())
      });
    }

    if (event.type === "increase") {
      return t("increasedFromTo", {
        oldPrice: Utils.formatPrice(event.oldPrice, item.currency, locale()),
        newPrice: Utils.formatPrice(event.newPrice, item.currency, locale())
      });
    }

    if (event.type === "unavailable") {
      return t("listingCurrentlyUnavailable");
    }

    return item?.meta?.lastError || t("priceUnchanged");
  }

  function currentPageFacts(listing, analysis) {
    const facts = [];
    const sellerTrust = Presentation.getSellerTrustMeta(listing, analysis);

    if (listing?.year) facts.push(String(listing.year));
    if (listing?.mileage) facts.push(`${Utils.formatNumber(listing.mileage, locale())} km`);
    if (listing?.fuel) facts.push(listing.fuel);
    if (listing?.transmission) facts.push(listing.transmission);
    if (analysis?.comparableCount) facts.push(`${analysis.comparableCount} ${t("comparables").toLowerCase()}`);
    if (listing?.sellerName) facts.push(listing.sellerName);
    if (sellerTrust) facts.push(sellerTrust.label);

    return facts.slice(0, 5);
  }

  function renderEmptyState(label, title, description, showClearAction) {
    return `
      <div class="empty-state">
        <div class="empty-state-label">${escape(label)}</div>
        <h3>${escape(title)}</h3>
        <p>${escape(description)}</p>
        ${showClearAction ? `
          <div class="empty-state-actions">
            <button class="secondary-button" type="button" data-clear-filters="true">${escape(t("clearFilters"))}</button>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderCurrentPage() {
    if (dashboardMode) {
      dom.currentPanel.hidden = true;
      return;
    }

    dom.currentPanel.hidden = false;

    if (popupState.loading.current && !popupState.currentPage) {
      dom.currentContent.innerHTML = renderEmptyState(t("checking"), t("analysisStillLoading"), t("analysisLoadingHint"), false);
      return;
    }

    const context = popupState.currentPage;
    if (!context || !context.listing?.supported || !context.listing?.isListingPage) {
      dom.currentContent.innerHTML = renderEmptyState(t("priceCheck"), t("openAvtoNetListing"), t("popupEmptyHint"), false);
      return;
    }

    if (!context.listing.available) {
      dom.currentContent.innerHTML = renderEmptyState(
        t("currentPage"),
        t("listingUnavailableTitle"),
        context.listing.summary || t("currentPageUnavailableFallback"),
        false
      );
      return;
    }

    if (!context.analysis) {
      dom.currentContent.innerHTML = renderEmptyState(t("checking"), t("analysisStillLoading"), t("analysisLoadingHint"), false);
      return;
    }

    const listing = context.listing;
    const analysis = context.analysis;
    const verdict = Presentation.getVerdictMeta(analysis.verdict);
    const bullets = Presentation.buildReasonBullets(listing, analysis, 3);
    const differenceText = Presentation.buildDifferenceText(listing, analysis, locale());
    const factList = currentPageFacts(listing, analysis);
    const saveBusy = popupState.busy.saveCurrent;
    const refreshBusy = popupState.busy.refreshCurrent;

    dom.currentContent.innerHTML = `
      <article class="listing-card">
        <div class="listing-head">
          <div class="listing-copy">
            <div class="verdict-pill verdict-pill--${escape(verdict.accent)}">${escape(Presentation.getVerdictLabel(analysis.verdict))}</div>
            <h3>${escape(listing.title || "Avto.net listing")}</h3>
            <p>${escape(Presentation.buildMainMessage(listing, analysis))}</p>
          </div>
          <div class="score-shell">
            <div>
              <span>${escape(t("score"))}</span>
              <strong>${analysis.dealScore ?? "--"}</strong>
            </div>
          </div>
        </div>

        ${factList.length ? `
          <div class="fact-list">
            ${factList.map((fact) => `<span class="fact-chip">${escape(fact)}</span>`).join("")}
          </div>
        ` : ""}

        <div class="meta-grid">
          <div class="meta-stat">
            <span>${escape(t("listed"))}</span>
            <strong>${escape(Utils.formatPrice(listing.price, listing.currency, locale()))}</strong>
          </div>
          <div class="meta-stat">
            <span>${escape(t("fairEstimate"))}</span>
            <strong>${escape(Utils.formatPrice(analysis.fairPrice, listing.currency, locale()))}</strong>
          </div>
          <div class="meta-stat">
            <span>${escape(t("confidence"))}</span>
            <strong>${escape(Presentation.getConfidenceLabel(analysis.confidence, analysis.isFallbackEstimate))}</strong>
          </div>
          <div class="meta-stat">
            <span>${escape(t("difference"))}</span>
            <strong>${escape(differenceText || t("atMarketLevel"))}</strong>
          </div>
        </div>

        <ul class="insight-list">
          ${bullets.map((bullet) => `<li>${escape(bullet)}</li>`).join("")}
        </ul>

        <div class="section-meta">
          ${context.updatedAt ? `<span class="toolbar-note">${escape(t("updated"))}: ${escape(Utils.formatDateTime(context.updatedAt, locale()))}</span>` : ""}
          <span class="toolbar-note">${escape(dashboardMode ? t("keyboardHintSearch") : t("keyboardHintPopup"))}</span>
        </div>

        <div class="action-row">
          <button class="primary-button" type="button" id="save-current-btn" ${saveBusy || refreshBusy ? "disabled" : ""}>${escape(saveBusy ? t("saving") : context.savedItem ? t("saved") : t("saveToWatchlist"))}</button>
          <button class="secondary-button" type="button" id="open-current-btn" ${refreshBusy ? "disabled" : ""}>${escape(t("openListingBtn"))}</button>
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

  function getFilteredWatchlist() {
    return Presentation.sortWatchlist(
      Presentation.filterWatchlist(popupState.watchlist, popupState.filters),
      popupState.filters.sort
    );
  }

  function visibleWatchlistItems(items) {
    if (dashboardMode) {
      return items;
    }
    return items.slice(0, 4);
  }

  function renderWatchlistSummary(filteredItems, visibleItems) {
    const total = popupState.watchlist.length;
    const filteredCount = filteredItems.length;
    const summaryText = filteredCount !== total
      ? t("watchlistResultsFiltered", { count: filteredCount, total })
      : t("watchlistResults", { count: total });

    dom.watchlistSummary.textContent = !dashboardMode && visibleItems.length < filteredItems.length
      ? `${summaryText} | ${visibleItems.length}/${filteredItems.length}`
      : summaryText;
  }

  function renderWatchlistCard(item, duplicateIndex) {
    const verdict = Presentation.getVerdictMeta(item.analysis?.verdict);
    const busyAction = popupState.busy.itemActions[item.id] || null;
    const latestEvent = Presentation.getLatestPriceEvent(item);
    const priceDropAmount = Presentation.getPriceDropAmount(item);
    const sellerTrust = Presentation.getSellerTrustMeta(item);
    const duplicateCount = duplicateIndex.get(item.id) || 0;
    const stale = Presentation.isStaleItem(item);
    const sparkline = Presentation.buildSparkline(Presentation.getPriceSeries(item), 116, 34);
    const chips = [
      item.currentPrice ? {
        label: Utils.formatPrice(item.currentPrice, item.currency, locale()),
        tone: "neutral"
      } : null,
      typeof item.analysis?.dealScore === "number" ? {
        label: `${item.analysis.dealScore} ${t("score").toLowerCase()}`,
        tone: "neutral"
      } : null,
      priceDropAmount ? {
        label: `-${Utils.formatPrice(priceDropAmount, item.currency, locale())}`,
        tone: "good"
      } : null,
      {
        label: `${t("lastChecked")}: ${Presentation.formatCheckedAt(item.history?.lastChecked, locale())}`,
        tone: Presentation.hasAttentionFlag(item) ? "danger" : "neutral"
      },
      stale ? {
        label: t("staleBadge"),
        tone: "warning"
      } : null,
      duplicateCount ? {
        label: t("possibleDuplicate"),
        tone: "warning"
      } : null,
      sellerTrust ? {
        label: sellerTrust.label,
        tone: sellerTrust.tone
      } : null
    ].filter(Boolean);

    const cardClasses = [
      "watch-card",
      priceDropAmount ? "watch-card--drop" : "",
      Presentation.hasAttentionFlag(item) ? "watch-card--attention" : ""
    ].filter(Boolean).join(" ");

    return `
      <article class="${cardClasses}" data-item-id="${escape(item.id)}">
        <div class="watch-media">
          ${item.imageUrl ? `<img class="watch-thumb" src="${escape(item.imageUrl)}" alt="${escape(item.title)}">` : ""}
          <span class="watch-pill verdict-pill--${escape(verdict.accent)}">${escape(Presentation.getVerdictLabel(item.analysis?.verdict || "insufficient-data"))}</span>
        </div>

        <div class="watch-body">
          <div class="watch-body__top">
            <div>
              <h3>${escape(item.title)}</h3>
              <p>${escape(item.meta?.lastError || historyText(item))}</p>
            </div>
            <div class="watch-score-badge">
              <span>${escape(t("score"))}</span>
              <strong>${item.analysis?.dealScore ?? "--"}</strong>
            </div>
          </div>

          <div class="watch-meta">
            ${chips.map((chip) => `<span class="meta-chip meta-chip--${chip.tone}">${escape(chip.label)}</span>`).join("")}
            ${latestEvent?.type === "drop" ? `<span class="meta-chip meta-chip--good">${escape(t("priceDropsMetricLabel"))}</span>` : ""}
            ${item.meta?.lastError ? `<span class="meta-chip meta-chip--danger">${escape(t("needAttention"))}</span>` : ""}
          </div>

          <div class="watch-sparkline">
            ${sparkline.path ? `
              <svg viewBox="0 0 116 34" aria-hidden="true" focusable="false">
                <path class="watch-sparkline__track" d="${escape(sparkline.path)}"></path>
              </svg>
            ` : ""}
          </div>

          <div class="watch-actions">
            <button class="watch-action" type="button" data-action="open" ${busyAction ? "disabled" : ""}>${escape(t("open"))}</button>
            <button class="watch-action" type="button" data-action="refresh" ${busyAction || popupState.busy.refreshAll ? "disabled" : ""}>${escape(busyAction === "refresh" ? t("refreshing") : t("refresh"))}</button>
            <button class="watch-action watch-action--danger" type="button" data-action="remove" ${busyAction || popupState.busy.refreshAll ? "disabled" : ""}>${escape(busyAction === "remove" ? t("removing") : t("remove"))}</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderWatchlist() {
    document.body.dataset.density = popupState.settings.watchlistDensity;
    updateMetrics();

    if (popupState.loading.watchlist && !popupState.watchlist.length) {
      dom.watchlistContent.innerHTML = renderEmptyState(t("watchlist"), t("analysisStillLoading"), t("analysisLoadingHint"), false);
      renderWatchlistSummary([], []);
      return;
    }

    if (!popupState.watchlist.length) {
      dom.watchlistContent.innerHTML = renderEmptyState(t("watchlist"), t("noSavedCarsYet"), t("noSavedCarsHint"), false);
      renderWatchlistSummary([], []);
      return;
    }

    const filteredItems = getFilteredWatchlist();
    const visibleItems = visibleWatchlistItems(filteredItems);
    const duplicateIndex = Presentation.buildDuplicateIndex(popupState.watchlist);
    renderWatchlistSummary(filteredItems, visibleItems);

    if (!filteredItems.length) {
      dom.watchlistContent.innerHTML = renderEmptyState(t("watchlist"), t("noMatchesTitle"), t("noMatchesHint"), true);
      return;
    }

    dom.watchlistContent.innerHTML = visibleItems.map((item) => renderWatchlistCard(item, duplicateIndex)).join("");
  }

  function syncSettingsControls() {
    dom.showPanel.checked = popupState.settings.showFloatingPanel;
    dom.autoRun.checked = popupState.settings.autoRunAnalysis;
    dom.notifications.checked = popupState.settings.notificationsEnabled;
    dom.defaultCollapsed.checked = popupState.settings.defaultCollapsed;
    dom.compactPanel.checked = popupState.settings.compactMode;
    dom.rememberPosition.checked = popupState.settings.rememberPanelPosition;
    dom.autoRefresh.checked = popupState.settings.autoRefreshOnPopupOpen;
    dom.cloudSync.checked = popupState.settings.cloudSyncEnabled;
    dom.density.value = popupState.settings.watchlistDensity;
    dom.watchlistFilter.value = popupState.filters.filter;
    dom.watchlistSort.value = popupState.filters.sort;
    dom.watchlistSearch.value = popupState.filters.query;
    applyTheme(popupState.settings.themeMode);
    updateMetrics();
  }

  async function loadSyncStatus() {
    const response = await runtimeSend({
      type: Constants.MESSAGE_TYPES.GET_SYNC_STATUS
    });
    popupState.syncStatus = Object.assign({
      lastSyncedAt: null,
      lastError: null
    }, response?.payload || {});
    renderStaticText();
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

  async function loadCurrentPage(force) {
    if (dashboardMode) {
      return;
    }

    popupState.loading.current = true;
    renderCurrentPage();
    popupState.activeTab = await getActiveTab();

    if (!popupState.activeTab?.id || !popupState.activeTab.url || !/(avto\.net|mobile\.de)/i.test(popupState.activeTab.url)) {
      popupState.currentPage = null;
      popupState.loading.current = false;
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
      setStatus(t("activeTabNotReady"), { error: true });
    } finally {
      popupState.loading.current = false;
      renderCurrentPage();
    }
  }

  async function loadWatchlist() {
    popupState.loading.watchlist = true;
    renderWatchlist();

    try {
      const response = await runtimeSend({
        type: Constants.MESSAGE_TYPES.GET_WATCHLIST
      });
      popupState.watchlist = response?.payload || [];
    } finally {
      popupState.loading.watchlist = false;
      renderWatchlist();
    }
  }

  async function updateSetting(patch) {
    const response = await runtimeSend({
      type: Constants.MESSAGE_TYPES.UPDATE_SETTINGS,
      payload: patch
    });

    popupState.settings = Object.assign({}, Constants.DEFAULT_SETTINGS, response?.payload || {});
    setLanguage(popupState.settings.language);
    syncSettingsControls();
    await loadSyncStatus();
    renderStaticText();
    renderCurrentPage();
    renderWatchlist();
  }

  function clearFilters() {
    popupState.filters.query = "";
    popupState.filters.filter = "all";
    popupState.filters.sort = "recommended";
    syncSettingsControls();
    renderWatchlist();
  }

  async function onSaveCurrent() {
    if (!popupState.currentPage?.listing || !popupState.currentPage?.analysis || popupState.busy.saveCurrent) {
      if (!popupState.currentPage?.analysis) {
        setStatus(t("noCurrentAnalysisToSave"), { error: true });
      }
      return;
    }

    popupState.busy.saveCurrent = true;
    renderStaticText();
    renderCurrentPage();

    try {
      const response = await runtimeSend({
        type: Constants.MESSAGE_TYPES.SAVE_ANALYSIS,
        payload: {
          listing: popupState.currentPage.listing,
          analysis: popupState.currentPage.analysis
        }
      });

      if (!response?.ok) {
        setStatus(response?.error || t("saveFailed"), { error: true });
        return;
      }

      popupState.currentPage.savedItem = response.payload.item;
      await loadWatchlist();
      setStatus(response.payload.existed ? t("listingUpdatedInWatchlist") : t("listingSavedToWatchlist"));
    } catch (error) {
      setStatus(error.message || t("saveFailed"), { error: true });
    } finally {
      popupState.busy.saveCurrent = false;
      renderStaticText();
      renderCurrentPage();
    }
  }

  async function onWatchlistAction(event) {
    const clearButton = event.target.closest("[data-clear-filters]");
    if (clearButton) {
      clearFilters();
      return;
    }

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
    popupState.busy.itemActions[itemId] = action;
    renderWatchlist();

    try {
      if (action === "open") {
        chrome.tabs.create({ url: item.url, active: true });
        return;
      }

      if (action === "remove") {
        await runtimeSend({
          type: Constants.MESSAGE_TYPES.REMOVE_WATCHLIST_ITEM,
          payload: { itemId }
        });
        await loadWatchlist();
        setStatus(t("removedFromWatchlist"));
        return;
      }

      if (action === "refresh") {
        setStatus(t("refreshingSavedListing"), { autoclear: false });
        await runtimeSend({
          type: Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_ITEM,
          payload: { itemId }
        });
        await loadWatchlist();
        setStatus(t("savedListingRefreshed"));
      }
    } catch (error) {
      setStatus(error.message || t("actionFailed"), { error: true });
    } finally {
      delete popupState.busy.itemActions[itemId];
      renderWatchlist();
    }
  }

  async function refreshAllWatchlist() {
    if (popupState.busy.refreshAll || !popupState.watchlist.length) {
      return;
    }

    popupState.busy.refreshAll = true;
    renderStaticText();
    setStatus(t("refreshingWatchlist"), { autoclear: false });

    try {
      const response = await runtimeSend({
        type: Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_BATCH,
        payload: {
          limit: popupState.watchlist.length
        }
      });

      await loadWatchlist();
      if (response?.payload?.summary) {
        setStatus(t("watchlistRefreshSummary", response.payload.summary));
      } else {
        setStatus(t("watchlistRefreshFinished"));
      }
    } catch (error) {
      setStatus(error.message || t("refreshFailed"), { error: true });
    } finally {
      popupState.busy.refreshAll = false;
      renderStaticText();
      renderWatchlist();
    }
  }

  async function refreshStaleWatchlist() {
    if (popupState.busy.refreshStale) {
      return;
    }

    popupState.busy.refreshStale = true;
    renderStaticText();
    setStatus(t("refreshingWatchlist"), { autoclear: false });

    try {
      const response = await runtimeSend({
        type: Constants.MESSAGE_TYPES.REFRESH_WATCHLIST_STALE,
        payload: {
          limit: popupState.watchlist.length
        }
      });

      await loadWatchlist();
      if (response?.payload?.summary) {
        setStatus(t("watchlistRefreshSummary", response.payload.summary));
      } else {
        setStatus(t("watchlistRefreshFinished"));
      }
    } catch (error) {
      setStatus(error.message || t("refreshFailed"), { error: true });
    } finally {
      popupState.busy.refreshStale = false;
      renderStaticText();
      renderWatchlist();
    }
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    globalScope.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function exportBackup() {
    if (popupState.busy.exportData) {
      return;
    }

    popupState.busy.exportData = true;
    renderStaticText();

    try {
      const response = await runtimeSend({
        type: Constants.MESSAGE_TYPES.EXPORT_BACKUP
      });
      const payload = response?.payload || {};
      const dateToken = new Date().toISOString().slice(0, 10);
      downloadTextFile(`autofair-backup-${dateToken}.json`, JSON.stringify(payload, null, 2));
      setStatus(t("exportSuccess"));
    } catch (error) {
      setStatus(error.message || t("actionFailed"), { error: true });
    } finally {
      popupState.busy.exportData = false;
      renderStaticText();
    }
  }

  async function runCloudSync() {
    if (popupState.busy.syncNow) {
      return;
    }

    if (!popupState.settings.cloudSyncEnabled) {
      setStatus(t("syncDisabledHint"));
      return;
    }

    popupState.busy.syncNow = true;
    renderStaticText();
    setStatus(t("refreshing"), { autoclear: false });

    try {
      const response = await runtimeSend({
        type: Constants.MESSAGE_TYPES.RUN_CLOUD_SYNC
      });
      popupState.syncStatus = Object.assign({}, popupState.syncStatus, response?.payload || {});
      await loadWatchlist();
      await loadSyncStatus();
      setStatus(response?.payload?.ok ? t("syncSuccess") : (response?.payload?.error || t("actionFailed")), {
        error: !response?.payload?.ok
      });
    } catch (error) {
      setStatus(error.message || t("actionFailed"), { error: true });
    } finally {
      popupState.busy.syncNow = false;
      renderStaticText();
    }
  }

  async function importBackupFromFile(file) {
    if (!file || popupState.busy.importData) {
      return;
    }

    popupState.busy.importData = true;
    renderStaticText();

    try {
      const text = await file.text();
      await runtimeSend({
        type: Constants.MESSAGE_TYPES.IMPORT_BACKUP,
        payload: {
          data: text,
          mode: "merge"
        }
      });
      await Promise.all([
        loadSettings(),
        loadWatchlist(),
        loadSyncStatus()
      ]);
      setStatus(t("importSuccess"));
    } catch (error) {
      setStatus(error.message || t("importInvalid"), { error: true });
    } finally {
      popupState.busy.importData = false;
      dom.importFileInput.value = "";
      renderStaticText();
    }
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

  function handleKeydown(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === "/" && !isTypingTarget(event.target)) {
      event.preventDefault();
      dom.watchlistSearch.focus();
      dom.watchlistSearch.select();
      return;
    }

    if (event.key === "Escape") {
      if (dom.watchlistSearch.value) {
        clearFilters();
      } else {
        setStatus("");
      }
      return;
    }

    if (isTypingTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "r" && event.shiftKey) {
      event.preventDefault();
      refreshAllWatchlist().catch((error) => {
        setStatus(error.message || t("refreshFailed"), { error: true });
      });
      return;
    }

    if (key === "r") {
      event.preventDefault();
      dom.refreshCurrentBtn.click();
      return;
    }

    if (key === "d") {
      event.preventDefault();
      dom.openDashboardBtn.click();
      return;
    }

    if (key === "s" && popupState.currentPage?.analysis) {
      event.preventDefault();
      onSaveCurrent().catch((error) => {
        setStatus(error.message || t("saveFailed"), { error: true });
      });
    }
  }

  function attachEvents() {
    dom.refreshCurrentBtn.addEventListener("click", async () => {
      if (popupState.busy.refreshCurrent) {
        return;
      }

      popupState.busy.refreshCurrent = true;
      renderStaticText();
      try {
        setStatus(t("refreshing"), { autoclear: false });
        await loadCurrentPage(true);
        setStatus("");
      } catch (error) {
        setStatus(error.message || t("refreshFailed"), { error: true });
      } finally {
        popupState.busy.refreshCurrent = false;
        renderStaticText();
        renderCurrentPage();
      }
    });

    dom.refreshWatchlistBtn.addEventListener("click", () => {
      refreshAllWatchlist().catch((error) => {
        setStatus(error.message || t("refreshFailed"), { error: true });
      });
    });

    dom.refreshStaleBtn.addEventListener("click", () => {
      refreshStaleWatchlist().catch((error) => {
        setStatus(error.message || t("refreshFailed"), { error: true });
      });
    });

    dom.openDashboardBtn.addEventListener("click", () => {
      openDashboard().catch((error) => {
        setStatus(error.message || t("actionFailed"), { error: true });
      });
    });

    dom.syncNowBtn.addEventListener("click", () => {
      runCloudSync().catch((error) => {
        setStatus(error.message || t("actionFailed"), { error: true });
      });
    });

    dom.exportBtn.addEventListener("click", () => {
      exportBackup().catch((error) => {
        setStatus(error.message || t("actionFailed"), { error: true });
      });
    });

    dom.importBtn.addEventListener("click", () => {
      dom.importFileInput.click();
    });

    dom.importFileInput.addEventListener("change", () => {
      importBackupFromFile(dom.importFileInput.files?.[0]).catch((error) => {
        setStatus(error.message || t("importInvalid"), { error: true });
      });
    });

    dom.clearFiltersBtn.addEventListener("click", clearFilters);
    dom.watchlistSearch.addEventListener("input", () => {
      popupState.filters.query = dom.watchlistSearch.value;
      renderWatchlist();
    });
    dom.watchlistFilter.addEventListener("change", () => {
      popupState.filters.filter = dom.watchlistFilter.value;
      renderWatchlist();
    });
    dom.watchlistSort.addEventListener("change", () => {
      popupState.filters.sort = dom.watchlistSort.value;
      renderWatchlist();
    });

    dom.watchlistContent.addEventListener("click", (event) => {
      onWatchlistAction(event).catch((error) => {
        setStatus(error.message || t("actionFailed"), { error: true });
      });
    });

    dom.supportBtn.addEventListener("click", () => {
      const support = supportConfig();
      if (!support.valid || !support.url) {
        setStatus(t("supportUnavailable"), { error: true });
        return;
      }
      chrome.tabs.create({
        url: support.url,
        active: true
      });
    });

    dom.showPanel.addEventListener("change", () => updateSetting({ showFloatingPanel: dom.showPanel.checked }).catch((error) => setStatus(error.message, { error: true })));
    dom.autoRun.addEventListener("change", () => updateSetting({ autoRunAnalysis: dom.autoRun.checked }).catch((error) => setStatus(error.message, { error: true })));
    dom.notifications.addEventListener("change", () => updateSetting({ notificationsEnabled: dom.notifications.checked }).catch((error) => setStatus(error.message, { error: true })));
    dom.defaultCollapsed.addEventListener("change", () => updateSetting({ defaultCollapsed: dom.defaultCollapsed.checked }).catch((error) => setStatus(error.message, { error: true })));
    dom.compactPanel.addEventListener("change", () => updateSetting({ compactMode: dom.compactPanel.checked }).catch((error) => setStatus(error.message, { error: true })));
    dom.rememberPosition.addEventListener("change", () => updateSetting({ rememberPanelPosition: dom.rememberPosition.checked }).catch((error) => setStatus(error.message, { error: true })));
    dom.cloudSync.addEventListener("change", () => updateSetting({ cloudSyncEnabled: dom.cloudSync.checked }).catch((error) => setStatus(error.message, { error: true })));
    dom.autoRefresh.addEventListener("change", () => updateSetting({ autoRefreshOnPopupOpen: dom.autoRefresh.checked }).catch((error) => setStatus(error.message, { error: true })));
    dom.density.addEventListener("change", () => updateSetting({ watchlistDensity: dom.density.value }).catch((error) => setStatus(error.message, { error: true })));

    dom.themeToggleBtn?.addEventListener("click", () => {
      const next = Presentation.normalizeTheme(popupState.settings.themeMode) === "light" ? "dark" : "light";
      updateSetting({ themeMode: next }).catch((error) => setStatus(error.message, { error: true }));
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

      if (changes[Constants.STORAGE_KEYS.SYNC_STATUS]) {
        popupState.syncStatus = Object.assign({
          lastSyncedAt: null,
          lastError: null
        }, changes[Constants.STORAGE_KEYS.SYNC_STATUS].newValue || {});
        renderStaticText();
      }
    });

    document.addEventListener("keydown", handleKeydown);
  }

  async function init() {
    document.body.dataset.mode = dashboardMode ? "dashboard" : "popup";
    document.documentElement.dataset.mode = dashboardMode ? "dashboard" : "popup";

    attachEvents();

    await Promise.all([
      loadSettings(),
      loadWatchlist(),
      loadCurrentPage(false),
      loadSyncStatus()
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
    setStatus(error.message || t("popupInitFailed"), { error: true });
  });
}(globalThis));
