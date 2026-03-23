(function initConstants(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};

  root.Constants = {
    APP_NAME: "AvtoFair",
    BRAND_NAME: "FlegarTech",
    SUBTITLE: "Know if the price is fair before you buy.",
    STORAGE_KEYS: {
      WATCHLIST: "avtofair.watchlist",
      SETTINGS: "avtofair.settings",
      PANEL_STATE: "avtofair.panelState"
    },
    MESSAGE_TYPES: {
      GET_PAGE_CONTEXT: "AVTOFAIR_GET_PAGE_CONTEXT",
      ANALYZE_PAGE: "AVTOFAIR_ANALYZE_PAGE",
      SAVE_ANALYSIS: "AVTOFAIR_SAVE_ANALYSIS",
      GET_WATCHLIST: "AVTOFAIR_GET_WATCHLIST",
      REMOVE_WATCHLIST_ITEM: "AVTOFAIR_REMOVE_WATCHLIST_ITEM",
      REFRESH_WATCHLIST_ITEM: "AVTOFAIR_REFRESH_WATCHLIST_ITEM",
      REFRESH_WATCHLIST_BATCH: "AVTOFAIR_REFRESH_WATCHLIST_BATCH",
      GET_SETTINGS: "AVTOFAIR_GET_SETTINGS",
      UPDATE_SETTINGS: "AVTOFAIR_UPDATE_SETTINGS",
      PAGE_ANALYSIS_UPDATED: "AVTOFAIR_PAGE_ANALYSIS_UPDATED",
      OPEN_DASHBOARD: "AVTOFAIR_OPEN_DASHBOARD"
    },
    REFRESH_HASH: "avtofair-background-refresh",
    WATCHLIST_ALARM_NAME: "avtofair-watchlist-refresh",
    WATCHLIST_ALARM_PERIOD_MINUTES: 360,
    ANALYSIS_DEBOUNCE_MS: 900,
    ANALYSIS_MIN_INTERVAL_MS: 5000,
    SUPPORT_URL: "https://paypal.me/flegartech",
    MAX_COMPARABLE_PAGES: 3,
    MAX_COMPARABLES: 30,
    MIN_COMPARABLES: 5,
    CURRENCY: "EUR",
    SITES: {
      AVTONET: "avtonet",
      MOBILEDE: "mobilede"
    },
    DEFAULT_SETTINGS: {
      notificationsEnabled: true,
      showFloatingPanel: true,
      autoRunAnalysis: true,
      defaultCollapsed: false,
      compactMode: false,
      rememberPanelPosition: true,
      autoRefreshOnPopupOpen: false,
      currencyFormat: "sl-SI",
      watchlistDensity: "detailed",
      themeMode: "dark",
      language: "en"
    },
    DEFAULT_PANEL_STATE: {
      x: null,
      y: null,
      collapsed: false,
      mode: "expanded",
      whyExpanded: false,
      marketExpanded: false
    },
    VERDICTS: {
      "great-deal": {
        label: "Great Deal",
        shortLabel: "Great",
        accent: "teal"
      },
      "good-price": {
        label: "Good Price",
        shortLabel: "Good",
        accent: "green"
      },
      "fair-price": {
        label: "Fair Price",
        shortLabel: "Fair",
        accent: "blue"
      },
      "slightly-overpriced": {
        label: "Slightly Overpriced",
        shortLabel: "Caution",
        accent: "amber"
      },
      "overpriced": {
        label: "Overpriced",
        shortLabel: "High",
        accent: "red"
      },
      "insufficient-data": {
        label: "Not Enough Data",
        shortLabel: "Low Data",
        accent: "slate"
      }
    },
    CONFIDENCE: {
      high: {
        label: "High confidence"
      },
      medium: {
        label: "Medium confidence"
      },
      low: {
        label: "Low confidence"
      }
    },
    SCORE_BANDS: [
      {
        min: 90,
        label: "Excellent deal"
      },
      {
        min: 80,
        label: "Very good"
      },
      {
        min: 70,
        label: "Good"
      },
      {
        min: 60,
        label: "Fair"
      },
      {
        min: 45,
        label: "Caution"
      },
      {
        min: 0,
        label: "Poor value"
      }
    ],
    SEARCH_DEFAULTS: {
      znamka: "",
      model: "",
      tip: "katerikoli tip",
      letnikMin: "0",
      letnikMax: "2090",
      cenaMin: "0",
      cenaMax: "999999",
      kmMin: "0",
      kmMax: "9999999",
      kwMin: "0",
      kwMax: "999",
      presort: "1",
      tipsort: "DESC",
      stran: "1"
    }
  };
}(globalThis));
