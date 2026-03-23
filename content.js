(function initContent(globalScope) {
  const {
    Constants,
    Utils,
    Parsing,
    Comparables,
    Pricing,
    DescriptionSignals,
    Scoring,
    Storage,
    Panel
  } = globalScope.AvtoFair;
  const I18n = globalScope.AvtoFair.I18n;

  // Initialization logging
  Utils.debug("init", "Content script loaded", {
    hasConstants: !!Constants,
    hasUtils: !!Utils,
    hasParsing: !!Parsing,
    hasComparables: !!Comparables,
    hasPricing: !!Pricing,
    hasScoring: !!Scoring,
    hasStorage: !!Storage,
    hasPanel: !!Panel
  });

  const state = {
    status: "idle",
    listing: null,
    analysis: null,
    comparables: [],
    error: null,
    updatedAt: null,
    savedItem: null,
    lastFingerprint: null,
    lastAnalyzeStartedAt: 0,
    lastObservedUrl: Utils.trimHash(globalScope.location.href)
  };

  const runtime = {
    panel: null,
    analysisPromise: null,
    scheduledTimer: null,
    mutationObserver: null,
    urlPollTimer: null
  };

  function isBackgroundRefreshTab() {
    return globalScope.location.hash.includes(Constants.REFRESH_HASH);
  }

  async function ensurePanelMounted() {
    const settings = await Storage.getSettings();
    if (!settings.showFloatingPanel || isBackgroundRefreshTab()) {
      return null;
    }

    if (!runtime.panel) {
      runtime.panel = Panel.create({
        onAction: handlePanelAction
      });
    }

    const panelState = await Storage.getPanelState();
    await runtime.panel.mount(settings, panelState);
    runtime.panel.setSettings(settings);
    return runtime.panel;
  }

  async function resolveSavedItem(listing) {
    if (!listing?.isListingPage || !listing.available) {
      return null;
    }

    const watchlist = await Storage.getWatchlist();
    return Storage.findExistingItem(watchlist, listing);
  }

  function buildPriceContext(pricing) {
    if (pricing.deviationPercent === null || pricing.deviationPercent === undefined) {
      return null;
    }

    return `Price is ${Math.abs(Math.round(pricing.deviationPercent))}% ${pricing.deviationPercent <= 0 ? "below" : "above"} similar listings.`;
  }

  async function updatePanel(modelPatch) {
    const panel = await ensurePanelMounted();
    if (!panel) {
      return;
    }

    panel.show();
    panel.setModel(modelPatch);
  }

  function hidePanelForUnsupportedPage() {
    if (runtime.panel?.root) {
      runtime.panel.root.hidden = true;
    }
  }

  async function analyzeCurrentPage(options) {
    const config = Object.assign({
      force: false,
      silent: false,
      reason: "auto"
    }, options || {});

    if (runtime.analysisPromise && !config.force) {
      return runtime.analysisPromise;
    }

    runtime.analysisPromise = (async () => {
      const settings = await Storage.getSettings();
      const fingerprint = Parsing.buildContentFingerprint(document, globalScope.location.href);
      const now = Date.now();

      if (!config.force && config.reason !== "popup" && !settings.autoRunAnalysis) {
        return getPageContext();
      }

      if (!config.force && state.lastFingerprint === fingerprint && state.status === "ready") {
        return getPageContext();
      }

      state.lastAnalyzeStartedAt = now;
      state.lastFingerprint = fingerprint;

      const parsedListing = Parsing.parseListingDocument(document, globalScope.location.href);
      state.listing = parsedListing;
      state.error = null;

      if (!parsedListing.supported || !parsedListing.isListingPage) {
        state.status = "unsupported";
        state.analysis = null;
        state.comparables = [];
        state.savedItem = null;
        if (!config.silent) {
          hidePanelForUnsupportedPage();
        }
        return getPageContext();
      }

      if (!parsedListing.available) {
        state.status = "unavailable";
        state.analysis = null;
        state.comparables = [];
        state.savedItem = null;
        if (!config.silent) {
          await updatePanel({
            status: "unavailable",
            message: parsedListing.summary,
            listing: parsedListing,
            analysis: null,
            comparables: [],
            savedItem: null
          });
        }
        return getPageContext();
      }

      state.status = "loading";
      if (!config.silent && !isBackgroundRefreshTab()) {
        await updatePanel({
          status: "loading",
          listing: parsedListing,
          analysis: null,
          comparables: [],
          savedItem: null
        });
      }

      const comparableResult = await Comparables.findComparables(parsedListing);
      const pricing = Pricing.evaluatePricing(parsedListing, comparableResult);
      const signals = DescriptionSignals.analyzeListingSignals(parsedListing, buildPriceContext(pricing));
      const analysis = Scoring.composeFinalAnalysis(parsedListing, pricing, signals);
      analysis.marketMeta = {
        fetchErrors: comparableResult.fetchErrors || [],
        relaxedLevel: comparableResult.relaxedLevel,
        searchUrlCount: comparableResult.searchUrls ? comparableResult.searchUrls.length : 0
      };
      analysis.marketBlockMessage = analysis.marketMeta.fetchErrors.length
        ? analysis.marketMeta.fetchErrors[0]
        : null;
      const savedItem = await resolveSavedItem(parsedListing);

      state.status = "ready";
      state.analysis = analysis;
      state.comparables = comparableResult.comparables || [];
      state.savedItem = savedItem;
      state.updatedAt = Date.now();

      if (!config.silent && !isBackgroundRefreshTab()) {
        await updatePanel({
          status: "ready",
          listing: parsedListing,
          analysis,
          comparables: state.comparables,
          savedItem
        });
      }

      try {
        chrome.runtime.sendMessage({
          type: Constants.MESSAGE_TYPES.PAGE_ANALYSIS_UPDATED,
          payload: {
            listing: parsedListing,
            analysis
          }
        });
      } catch (error) {
        // Ignore background wake-up failures.
      }

      return getPageContext();
    })().catch(async (error) => {
      state.status = "error";
      state.error = error.message;

      if (!config.silent && !isBackgroundRefreshTab()) {
        await updatePanel({
          status: "error",
          error: error.message,
          listing: state.listing,
          analysis: state.analysis,
          comparables: state.comparables,
          savedItem: state.savedItem
        });
      }

      return getPageContext();
    }).finally(() => {
      runtime.analysisPromise = null;
    });

    return runtime.analysisPromise;
  }

  function scheduleAnalysis(reason, force) {
    clearTimeout(runtime.scheduledTimer);
    runtime.scheduledTimer = globalScope.setTimeout(() => {
      const elapsed = Date.now() - state.lastAnalyzeStartedAt;
      if (!force && elapsed < Constants.ANALYSIS_MIN_INTERVAL_MS) {
        scheduleAnalysis(reason, true);
        return;
      }

      analyzeCurrentPage({
        force: Boolean(force),
        reason
      }).catch(() => {
        // Retry paths remain available through manual refresh.
      });
    }, Constants.ANALYSIS_DEBOUNCE_MS);
  }

  function startObservers() {
    if (isBackgroundRefreshTab()) {
      return;
    }

    runtime.mutationObserver = new MutationObserver((mutations) => {
      const relevantMutation = mutations.some((mutation) => {
        const targetInsidePanel = mutation.target instanceof Element
          ? mutation.target.closest("[data-avtofair-root]")
          : null;
        if (targetInsidePanel) {
          return false;
        }

        const addedOutsidePanel = Array.from(mutation.addedNodes || []).some((node) => {
          return !(node instanceof Element) || !node.closest("[data-avtofair-root]");
        });

        const removedOutsidePanel = Array.from(mutation.removedNodes || []).some((node) => {
          return !(node instanceof Element) || !node.closest("[data-avtofair-root]");
        });

        return addedOutsidePanel || removedOutsidePanel;
      });

      if (!relevantMutation) {
        return;
      }

      scheduleAnalysis("dom-change", false);
    });

    runtime.mutationObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: false
    });

    runtime.urlPollTimer = globalScope.setInterval(() => {
      const currentUrl = Utils.trimHash(globalScope.location.href);
      if (currentUrl !== state.lastObservedUrl) {
        state.lastObservedUrl = currentUrl;
        state.lastFingerprint = null;
        runtime.panel?.resetForNewPage();
        scheduleAnalysis("url-change", true);
      }
    }, 1200);
  }

  function stopObservers() {
    runtime.mutationObserver?.disconnect();
    runtime.mutationObserver = null;
    if (runtime.urlPollTimer) {
      globalScope.clearInterval(runtime.urlPollTimer);
      runtime.urlPollTimer = null;
    }
    if (runtime.scheduledTimer) {
      globalScope.clearTimeout(runtime.scheduledTimer);
      runtime.scheduledTimer = null;
    }
  }

  async function handlePanelAction(action) {
    if (action === "refresh") {
      await analyzeCurrentPage({
        force: true,
        reason: "manual"
      });
      return;
    }

    if (action === "save") {
      if (!state.listing || !state.analysis) {
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: Constants.MESSAGE_TYPES.SAVE_ANALYSIS,
        payload: {
          listing: state.listing,
          analysis: state.analysis
        }
      });

      if (response?.ok) {
        state.savedItem = response.payload.item;
        runtime.panel?.setModel({
          savedItem: state.savedItem
        });
      }
      return;
    }

    if (action === "open-dashboard") {
      await chrome.runtime.sendMessage({
        type: Constants.MESSAGE_TYPES.OPEN_DASHBOARD
      });
    }
  }

  function getPageContext() {
    return {
      status: state.status,
      listing: state.listing,
      analysis: state.analysis,
      comparables: state.comparables,
      savedItem: state.savedItem,
      error: state.error,
      updatedAt: state.updatedAt
    };
  }

  function attachMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      (async () => {
        if (message?.type === Constants.MESSAGE_TYPES.GET_PAGE_CONTEXT) {
          if (state.status === "idle") {
            await analyzeCurrentPage({
              silent: true,
              reason: "popup"
            });
          }

          sendResponse({
            ok: true,
            payload: getPageContext()
          });
          return;
        }

        if (message?.type === Constants.MESSAGE_TYPES.ANALYZE_PAGE) {
          const payload = await analyzeCurrentPage({
            force: Boolean(message.payload?.force),
            silent: Boolean(message.payload?.silent),
            reason: message.payload?.reason || "external"
          });

          sendResponse({
            ok: true,
            payload
          });
          return;
        }

        sendResponse({
          ok: false,
          error: "Unknown message type."
        });
      })().catch((error) => {
        sendResponse({
          ok: false,
          error: error.message
        });
      });

      return true;
    });
  }

  function attachStorageListeners() {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (changes[Constants.STORAGE_KEYS.SETTINGS]) {
        const settings = await Storage.getSettings();
        if (I18n) I18n.setLang(settings.language || "en");
        if (!settings.showFloatingPanel) {
          if (runtime.panel?.root) {
            runtime.panel.root.hidden = true;
          }
          return;
        }

        const panel = await ensurePanelMounted();
        panel?.setSettings(settings);
        if (state.status === "ready") {
          panel?.setModel({
            status: "ready",
            listing: state.listing,
            analysis: state.analysis,
            comparables: state.comparables,
            savedItem: state.savedItem
          });
        }
      }

      if (changes[Constants.STORAGE_KEYS.WATCHLIST] && state.listing?.isListingPage) {
        state.savedItem = await resolveSavedItem(state.listing);
        runtime.panel?.setModel({
          savedItem: state.savedItem
        });
      }
    });
  }

  async function init() {
    attachMessageHandlers();
    attachStorageListeners();
    startObservers();

    if (!isBackgroundRefreshTab()) {
      const settings = await Storage.getSettings();
      if (I18n) I18n.setLang(settings.language || "en");
      if (settings.showFloatingPanel) {
        await ensurePanelMounted();
      }
    }

    analyzeCurrentPage({
      force: true,
      reason: "initial"
    }).catch(() => {
      // The page can still be refreshed manually if needed.
    });
  }

  globalScope.addEventListener("beforeunload", stopObservers);

  init();
}(globalThis));
