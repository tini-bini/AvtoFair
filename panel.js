(function initPanel(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const { Constants, Utils, Storage } = root;
  const I18n = root.I18n;
  const t = (key) => I18n ? I18n.t(key) : key;

  class FloatingPanel {
    constructor(options) {
      this.options = Object.assign({ onAction: () => {} }, options || {});
      this.root = null;
      this.settings = Object.assign({}, Constants.DEFAULT_SETTINGS);
      this.panelState = Object.assign({}, Constants.DEFAULT_PANEL_STATE);
      this.model = { status: "idle" };
      this.collapsed = false;
      this.detailsExpanded = false;
      this.dismissedForPage = false;
      this.drag = null;
      this.pendingPosition = null;
      this.dragRafId = null;

      this.handleWindowResize = this.handleWindowResize.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);
      this.handleRootClick = this.handleRootClick.bind(this);
      this.handleRootPointerDown = this.handleRootPointerDown.bind(this);
    }

    async mount(settings, panelState) {
      this.settings = Object.assign({}, this.settings, settings || {});
      this.panelState = Object.assign({}, this.panelState, panelState || {});
      this.collapsed = typeof this.panelState.collapsed === "boolean"
        ? this.panelState.collapsed
        : Boolean(this.settings.defaultCollapsed);
      this.detailsExpanded = Boolean(this.panelState.whyExpanded);

      if (this.root && document.body.contains(this.root)) {
        this.render();
        this.updatePosition();
        return;
      }

      this.root = document.createElement("section");
      this.root.className = "avtofair-panel";
      this.root.dataset.avtofairRoot = "panel";
      this.root.setAttribute("data-avtofair-root", "panel");
      this.root.setAttribute("aria-live", "polite");
      this.root.addEventListener("click", this.handleRootClick);
      this.root.addEventListener("pointerdown", this.handleRootPointerDown);
      document.body.appendChild(this.root);

      globalScope.addEventListener("resize", this.handleWindowResize);

      this.render();
      this.updatePosition();
    }

    destroy() {
      this.cleanupDrag();
      globalScope.removeEventListener("resize", this.handleWindowResize);
      if (this.root) {
        this.root.remove();
      }
      this.root = null;
    }

    setModel(nextModel) {
      this.model = Object.assign({}, this.model, nextModel || {});
      this.render();
      this.updatePosition();
    }

    setSettings(nextSettings) {
      this.settings = Object.assign({}, this.settings, nextSettings || {});
      if (!this.settings.rememberPanelPosition) {
        this.panelState.x = null;
        this.panelState.y = null;
      }
      this.render();
      this.updatePosition();
    }

    resetForNewPage() {
      this.dismissedForPage = false;
      this.show();
    }

    show() {
      if (this.root) {
        this.root.hidden = false;
      }
    }

    hideForPage() {
      this.dismissedForPage = true;
      if (this.root) {
        this.root.hidden = true;
      }
    }

    async persistPanelState(patch) {
      this.panelState = await Storage.updatePanelState(Object.assign({
        collapsed: this.collapsed,
        whyExpanded: this.detailsExpanded
      }, patch || {}));
      return this.panelState;
    }

    async toggleCollapsed() {
      this.collapsed = !this.collapsed;
      await this.persistPanelState({ collapsed: this.collapsed });
      this.render();
      this.updatePosition();
    }

    async toggleDetails() {
      this.detailsExpanded = !this.detailsExpanded;
      await this.persistPanelState({ whyExpanded: this.detailsExpanded });
      this.render();
      this.updatePosition();
    }

    async setLanguage(lang) {
      if (I18n) I18n.setLang(lang);
      await Storage.updateSettings({ language: lang });
      this.render();
    }

    async resetPosition() {
      this.panelState = await Storage.resetPanelState();
      this.collapsed = Boolean(this.settings.defaultCollapsed);
      this.detailsExpanded = false;
      this.render();
      this.updatePosition(true);
    }

    handleWindowResize() {
      this.updatePosition();
    }

    handleRootClick(event) {
      const actionTarget = event.target.closest("[data-panel-action]");
      if (!actionTarget) {
        return;
      }

      const action = actionTarget.dataset.panelAction;

      if (action === "collapse") {
        this.toggleCollapsed().catch(() => {});
        return;
      }

      if (action === "close") {
        this.hideForPage();
        return;
      }

      if (action === "toggle-details") {
        this.toggleDetails().catch(() => {});
        return;
      }

      if (action === "reset-position") {
        this.resetPosition().catch(() => {});
        return;
      }

      if (action.startsWith("lang-")) {
        const lang = action.slice(5);
        this.setLanguage(lang).catch(() => {});
        return;
      }

      this.options.onAction(action);
    }

    handleRootPointerDown(event) {
      const handle = event.target.closest("[data-avtofair-drag-handle]");
      if (!handle || event.button !== 0 || event.target.closest("button, a, input, select, textarea")) {
        return;
      }

      const rect = this.root.getBoundingClientRect();
      this.drag = {
        pointerId: event.pointerId,
        handle,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };

      event.preventDefault();
      this.root.dataset.dragging = "true";
      document.body.classList.add("avtofair-no-select");

      if (handle.setPointerCapture) {
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (error) {
        }
      }

      globalScope.addEventListener("pointermove", this.handlePointerMove);
      globalScope.addEventListener("pointerup", this.handlePointerUp);
      globalScope.addEventListener("pointercancel", this.handlePointerCancel);
    }

    handlePointerMove(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) {
        return;
      }

      this.pendingPosition = {
        x: event.clientX - this.drag.offsetX,
        y: event.clientY - this.drag.offsetY
      };

      if (this.dragRafId) {
        return;
      }

      this.dragRafId = globalScope.requestAnimationFrame(() => {
        this.dragRafId = null;
        if (this.pendingPosition) {
          this.applyPosition(this.pendingPosition.x, this.pendingPosition.y);
        }
      });
    }

    handlePointerUp(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) {
        return;
      }

      const rect = this.root.getBoundingClientRect();
      this.cleanupDrag();

      if (this.settings.rememberPanelPosition) {
        this.persistPanelState({
          x: Math.round(rect.left),
          y: Math.round(rect.top)
        }).catch(() => {});
      }
    }

    handlePointerCancel(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) {
        return;
      }
      this.cleanupDrag();
    }

    cleanupDrag() {
      if (this.dragRafId) {
        globalScope.cancelAnimationFrame(this.dragRafId);
        this.dragRafId = null;
      }

      this.pendingPosition = null;
      this.drag = null;
      document.body.classList.remove("avtofair-no-select");
      globalScope.removeEventListener("pointermove", this.handlePointerMove);
      globalScope.removeEventListener("pointerup", this.handlePointerUp);
      globalScope.removeEventListener("pointercancel", this.handlePointerCancel);

      if (this.root) {
        delete this.root.dataset.dragging;
      }
    }

    getPanelWidth() {
      if (this.collapsed) {
        return 286;
      }
      return this.settings.compactMode ? 330 : 372;
    }

    getDefaultPosition() {
      const width = this.root ? this.root.offsetWidth : this.getPanelWidth();
      const height = this.root ? this.root.offsetHeight : 340;

      return {
        x: Math.max(12, globalScope.innerWidth - width - 20),
        y: Math.min(
          Math.max(68, Math.round(globalScope.innerHeight * 0.12)),
          Math.max(12, globalScope.innerHeight - height - 16)
        )
      };
    }

    clampPosition(x, y) {
      const width = this.root ? this.root.offsetWidth : this.getPanelWidth();
      const height = this.root ? this.root.offsetHeight : 340;

      return {
        x: Math.round(Utils.clamp(x, 8, Math.max(8, globalScope.innerWidth - width - 8))),
        y: Math.round(Utils.clamp(y, 8, Math.max(8, globalScope.innerHeight - height - 8)))
      };
    }

    applyPosition(x, y) {
      if (!this.root) {
        return;
      }

      const clamped = this.clampPosition(x, y);
      this.root.style.left = `${clamped.x}px`;
      this.root.style.top = `${clamped.y}px`;
      this.root.style.right = "auto";
      this.root.style.bottom = "auto";
    }

    updatePosition(forceDefault) {
      if (!this.root) {
        return;
      }

      const shouldUseSaved = this.settings.rememberPanelPosition
        && !forceDefault
        && Number.isFinite(this.panelState.x)
        && Number.isFinite(this.panelState.y);

      const target = shouldUseSaved
        ? this.clampPosition(this.panelState.x, this.panelState.y)
        : this.getDefaultPosition();

      this.applyPosition(target.x, target.y);
    }

    getVerdictText(verdict) {
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

    getVerdictShortText(verdict) {
      const keys = {
        "great-deal": "underMarket",
        "good-price": "belowMarket",
        "fair-price": "nearMarket",
        "slightly-overpriced": "aboveMarket",
        "overpriced": "wellAboveMarket",
        "insufficient-data": "checkingShort"
      };
      return t(keys[verdict] || "checkingShort");
    }

    getAvailableLangs() {
      const site = this.model.listing?.site || Constants.SITES.AVTONET;
      return site === Constants.SITES.MOBILEDE ? ["en", "sl", "de"] : ["en", "sl"];
    }

    getVerdictMeta() {
      const verdict = this.model.analysis?.verdict || "insufficient-data";
      return Constants.VERDICTS[verdict] || Constants.VERDICTS["insufficient-data"];
    }

    buildMainMessage(listing, analysis) {
      if (!listing?.price) {
        return "AvtoFair could not read the asking price clearly from this page yet.";
      }

      if (analysis.marketBlockMessage && (analysis.deviationPercent === null || analysis.deviationPercent === undefined)) {
        return "Avto.net blocked the market check right now. Try refreshing in a moment.";
      }

      if (analysis.deviationPercent === null || analysis.deviationPercent === undefined) {
        return t("noResult");
      }

      if (analysis.isFallbackEstimate) {
        const rounded = Math.abs(Math.round(analysis.deviationPercent));
        const dir = analysis.deviationPercent <= 0 ? t("below") : t("above");
        return `~${rounded}% ${dir} typical depreciation estimate. No live comparables yet.`;
      }

      const rounded = Math.abs(Math.round(analysis.deviationPercent));
      if (analysis.deviationPercent <= -8) {
        return `This car looks around ${rounded}% cheaper than similar cars.`;
      }
      if (analysis.deviationPercent < -3) {
        return `This car looks a bit cheaper than similar cars.`;
      }
      if (analysis.deviationPercent <= 3) {
        return "This car is priced close to what similar cars usually cost.";
      }
      if (analysis.deviationPercent < 8) {
        return `This car looks a little more expensive than similar cars.`;
      }
      return `This car looks around ${rounded}% more expensive than similar cars.`;
    }

    buildDifferenceText(listing, analysis) {
      if (!listing?.price || !analysis?.fairPrice) {
        return null;
      }

      const prefix = analysis.isFallbackEstimate ? "~" : "";
      const difference = listing.price - analysis.fairPrice;
      const absolute = Utils.formatPrice(Math.abs(difference), listing.currency);

      if (Math.abs(difference) < 200) return t("atMarketLevel");
      if (difference < 0) return `${prefix}${absolute} ${t("below")}`;
      return `${prefix}${absolute} ${t("above")}`;
    }

    buildScoreDisplay(analysis) {
      if (analysis.deviationPercent === null || analysis.deviationPercent === undefined) {
        return "?";
      }
      const rounded = Math.round(analysis.deviationPercent);
      const prefix = rounded > 0 ? "+" : "";
      return `${prefix}${rounded}%`;
    }

    getSimpleReasons(analysis) {
      if (analysis.marketBlockMessage) {
        return [
          analysis.marketBlockMessage,
          "Try Refresh after the page has fully finished loading."
        ];
      }

      const reasons = (analysis.explanationBullets || []).slice(0, 3);
      if (reasons.length) {
        return reasons;
      }

      return ["AvtoFair could not find enough simple reasons yet."];
    }

    getHeaderSubtitle() {
      const listing = this.model.listing;
      if (!listing) return "Price check";
      const parts = [listing.year, listing.make, listing.model].filter(Boolean);
      return parts.length ? parts.join(" ") : "Price check";
    }

    renderHeader() {
      const currentLang = I18n ? I18n.getLang() : "en";
      const availableLangs = this.getAvailableLangs();
      const langButtons = availableLangs.map((lang) =>
        `<button type="button" class="avtofair-panel__lang-btn${lang === currentLang ? " is-active" : ""}" data-panel-action="lang-${lang}">${lang.toUpperCase()}</button>`
      ).join("");

      return `
        <div class="avtofair-panel__header" data-avtofair-drag-handle="true">
          <div class="avtofair-panel__title-wrap">
            <div class="avtofair-panel__title-row">
              <span class="avtofair-panel__title">AvtoFair</span>
              <div class="avtofair-panel__lang">${langButtons}</div>
            </div>
            <div class="avtofair-panel__subtitle">${Utils.escapeHtml(this.getHeaderSubtitle())}</div>
          </div>
          <div class="avtofair-panel__header-actions">
            <button type="button" data-panel-action="collapse" title="${this.collapsed ? t("expand") : t("minimize")}">
              ${this.collapsed
                ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
                : `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
            </button>
            <button type="button" data-panel-action="close" title="${t("hideForPage")}">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
      `;
    }

    renderCollapsed(listing, analysis, verdictMeta) {
      return `
        ${this.renderHeader()}
        <div class="avtofair-panel__collapsed">
          <div class="avtofair-panel__mini-status avtofair-panel__mini-status--${verdictMeta.accent}">${Utils.escapeHtml(this.getVerdictText(analysis.verdict))}</div>
          <div class="avtofair-panel__mini-price">${Utils.escapeHtml(Utils.formatPrice(listing.price, listing.currency))}</div>
        </div>
      `;
    }

    renderField(label, value) {
      return `
        <div class="avtofair-panel__field">
          <span>${Utils.escapeHtml(label)}</span>
          <strong>${Utils.escapeHtml(value)}</strong>
        </div>
      `;
    }

    renderReady() {
      const listing = this.model.listing;
      const analysis = this.model.analysis;
      const verdictMeta = this.getVerdictMeta();
      const verdictText = this.getVerdictText(analysis.verdict);
      const verdictShort = this.getVerdictShortText(analysis.verdict);
      const reasons = this.getSimpleReasons(analysis);
      const isFallback = Boolean(analysis.isFallbackEstimate);
      const saveLabel = this.model.savedItem ? t("saved") : t("save");
      const estPrefix = isFallback ? "~" : "";
      const carPriceText = listing.price ? Utils.formatPrice(listing.price, listing.currency) : "—";
      const normalPriceText = analysis.fairPrice
        ? `${estPrefix}${Utils.formatPrice(analysis.fairPrice, listing.currency)}`
        : null;
      const confidenceLabel = isFallback
        ? t("depreciationEst")
        : t(analysis.confidence === "high" ? "highConfidence" : analysis.confidence === "medium" ? "mediumConfidence" : "lowConfidence");
      const scoreDisplay = this.buildScoreDisplay(analysis);
      const differenceText = this.buildDifferenceText(listing, analysis);

      if (this.collapsed) {
        return this.renderCollapsed(listing, analysis, verdictMeta);
      }

      return `
        ${this.renderHeader()}
        <div class="avtofair-panel__body">
          <div class="avtofair-panel__verdict avtofair-panel__verdict--${verdictMeta.accent}">
            <div class="avtofair-panel__score avtofair-panel__score--${verdictMeta.accent}">${Utils.escapeHtml(scoreDisplay)}</div>
            <div class="avtofair-panel__verdict-copy">
              <div class="avtofair-panel__badge avtofair-panel__badge--${verdictMeta.accent}">${Utils.escapeHtml(verdictShort)}</div>
              <h3>${Utils.escapeHtml(verdictText)}</h3>
              <p>${Utils.escapeHtml(this.buildMainMessage(listing, analysis))}</p>
            </div>
          </div>

          <div class="avtofair-panel__fields">
            ${this.renderField(t("listedPrice"), carPriceText)}
            ${normalPriceText ? this.renderField(isFallback ? t("estMarketValue") : t("marketValue"), normalPriceText) : ""}
            ${differenceText ? this.renderField(t("difference"), differenceText) : ""}
            ${this.renderField(t("data"), confidenceLabel)}
          </div>

          ${reasons.length ? `
            <ul class="avtofair-panel__reasons">
              ${reasons.map((reason) => `<li>${Utils.escapeHtml(reason)}</li>`).join("")}
            </ul>
          ` : ""}

          <div class="avtofair-panel__actions">
            <button type="button" class="avtofair-panel__btn avtofair-panel__btn--primary" data-panel-action="save">${Utils.escapeHtml(saveLabel)}</button>
            <button type="button" class="avtofair-panel__btn" data-panel-action="refresh">${t("refresh")}</button>
            <button type="button" class="avtofair-panel__btn" data-panel-action="toggle-details">${this.detailsExpanded ? t("less") : t("details")}</button>
          </div>

          ${this.detailsExpanded ? `
            <div class="avtofair-panel__details">
              <div class="avtofair-panel__detail-grid">
                ${this.renderField(t("year"), listing.year ? String(listing.year) : "—")}
                ${this.renderField(t("mileage"), listing.mileage ? `${Utils.formatNumber(listing.mileage)} km` : "—")}
                ${this.renderField(t("fuel"), listing.fuel || "—")}
                ${this.renderField(t("gearbox"), listing.transmission || "—")}
                ${this.renderField(t("power"), listing.powerKw ? `${listing.powerKw} kW` : "—")}
                ${this.renderField(t("comparables"), isFallback ? t("noComparables") : `${analysis.comparableCount}`)}
              </div>

              ${(analysis.positiveSignals || []).length ? `
                <div class="avtofair-panel__signal-box">
                  <div class="avtofair-panel__signal-title">${t("goodSigns")}</div>
                  <div class="avtofair-panel__chips">
                    ${(analysis.positiveSignals || []).slice(0, 5).map((signal) => `<span class="avtofair-panel__chip avtofair-panel__chip--good">${Utils.escapeHtml(signal.label)}</span>`).join("")}
                  </div>
                </div>
              ` : ""}

              ${(analysis.riskFlags || []).length ? `
                <div class="avtofair-panel__signal-box">
                  <div class="avtofair-panel__signal-title">${t("watchOut")}</div>
                  <div class="avtofair-panel__chips">
                    ${(analysis.riskFlags || []).slice(0, 5).map((signal) => `<span class="avtofair-panel__chip avtofair-panel__chip--bad">${Utils.escapeHtml(signal)}</span>`).join("")}
                  </div>
                </div>
              ` : ""}

              <div class="avtofair-panel__detail-actions">
                <button type="button" class="avtofair-panel__link" data-panel-action="open-dashboard">${t("openDashboard")}</button>
                <button type="button" class="avtofair-panel__link" data-panel-action="reset-position">${t("resetPosition")}</button>
              </div>
            </div>
          ` : ""}
        </div>
      `;
    }

    renderLoading() {
      return `
        ${this.renderHeader()}
        <div class="avtofair-panel__body">
          <div class="avtofair-panel__state">
            <div class="avtofair-panel__spinner"></div>
            <h3>${t("checking")}</h3>
            <p>${t("scanningMarket")}</p>
          </div>
        </div>
      `;
    }

    renderMessage(title, description, tone) {
      return `
        ${this.renderHeader()}
        <div class="avtofair-panel__body">
          <div class="avtofair-panel__state avtofair-panel__state--${tone}">
            <h3>${Utils.escapeHtml(title)}</h3>
            <p>${Utils.escapeHtml(description)}</p>
            <div class="avtofair-panel__actions">
              <button type="button" class="avtofair-panel__btn avtofair-panel__btn--primary" data-panel-action="refresh">${t("refresh")}</button>
              <button type="button" class="avtofair-panel__btn" data-panel-action="reset-position">${t("resetPosition")}</button>
            </div>
          </div>
        </div>
      `;
    }

    render() {
      if (!this.root) {
        return;
      }

      if (this.dismissedForPage) {
        this.root.hidden = true;
        return;
      }

      this.root.hidden = false;
      this.root.dataset.collapsed = this.collapsed ? "true" : "false";
      this.root.dataset.state = this.model.status || "idle";
      this.root.dataset.compact = this.settings.compactMode ? "true" : "false";

      if (this.model.status === "ready" && this.model.analysis && this.model.listing) {
        this.root.innerHTML = this.renderReady();
        return;
      }

      if (this.model.status === "loading" || this.model.status === "analyzing") {
        this.root.innerHTML = this.renderLoading();
        return;
      }

      if (this.model.status === "error") {
        this.root.innerHTML = this.renderMessage(
          t("couldNotCheck"),
          this.model.error || t("tryAgain"),
          "error"
        );
        return;
      }

      if (this.model.status === "unavailable") {
        this.root.innerHTML = this.renderMessage(
          t("listingUnavailable"),
          this.model.message || t("adRemoved"),
          "neutral"
        );
        return;
      }

      this.root.innerHTML = this.renderMessage(
        t("openListing"),
        this.model.message || t("worksOnSite"),
        "neutral"
      );
    }
  }

  root.Panel = {
    create(options) {
      return new FloatingPanel(options);
    }
  };
}(globalThis));
