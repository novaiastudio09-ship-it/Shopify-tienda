if (!customElements.get('x-predictive-search')) {
  const MODAL_OPEN_CLASS = 'x-model-search--open';

  class XPredictiveSearch extends HTMLElement {
    constructor() {
      super();
      this.cachedMap = new Map();
      this.modal = this.querySelector('.x-model-search');
      this.searchContent = this.querySelector('.x-predictive-search__content');
      this.modalContainer = this.querySelector('.x-model-search__container');
      this.searchRecommendationEmpty = this.dataset.searchRecommendationEmpty === 'true';
      this.section = this.closest('.x-section');
      this.xElement = this.closest('.x-element');

      this.resetButton.addEventListener('click', this.clear.bind(this));
      const debounceFn = window.Foxify?.Utils?.debounce;
      const inputHandler = debounceFn ? debounceFn(this.onChange.bind(this), 300) : this.onChange.bind(this);
      this.input.addEventListener('input', inputHandler);
      this.input.addEventListener('focus', this.onFocus.bind(this));

      this.bindTrigger();
      this.bindClose();
      this.boundHandleClickOutside = this.handleClickOutside.bind(this);
      this.boundHandleKeydown = this.handleKeydown.bind(this);
      document.addEventListener('click', this.boundHandleClickOutside);
      document.addEventListener('keydown', this.boundHandleKeydown);
      this.searchProductTypes?.addEventListener('change', this.handleProductTypeChange.bind(this));

      this.states = {
        OPEN: 'x-predictive-search-open',
        LOADING: 'x-btn--loading',
        SEARCH_INDEX: 'x-search-index',
        IS_OPEN: 'is-open',
      };
    }

    bindTrigger() {
      const triggers = this.querySelectorAll('[data-predictive-search-trigger]');
      triggers.forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          this.openModal();
        });
        if (el.tagName === 'INPUT') {
          el.addEventListener('focus', (e) => {
            e.preventDefault();
            this.openModal();
          });
        }
      });
    }

    bindClose() {
      const closeButtons = this.querySelectorAll('[data-predictive-search-close]');
      closeButtons.forEach((el) => {
        el.addEventListener('click', () => this.closeModal());
      });
    }

    openModal() {
      if (this.modal) {
        this.modal.classList.add(MODAL_OPEN_CLASS);
        this.modal.setAttribute('aria-hidden', 'false');
        if (this.section) this.section.classList.add(this.states.SEARCH_INDEX);

        const hasAnimationClass = (el) => Array.from(el.classList).some((cls) => cls.startsWith('x-animation'));

        let animatedElement = this.xElement;
        animatedElement.classList.add(this.states.IS_OPEN);
        if (animatedElement) {
          if (!hasAnimationClass(animatedElement)) {
            let current = animatedElement.parentElement?.closest('.x-element');
            while (current && current !== this.section) {
              if (hasAnimationClass(current)) {
                animatedElement = current;
                break;
              }
              current = current.parentElement?.closest('.x-element');
            }
          }

          if (hasAnimationClass(animatedElement)) {
            animatedElement.style.animationName = 'none';
          }
        }

        document.body.style.overflow = 'hidden';
        this.input.focus();
      }
    }

    closeModal() {
      if (this.modal) {
        this.modal.classList.remove(MODAL_OPEN_CLASS);
        this.modal.setAttribute('aria-hidden', 'true');
        this.classList.remove(this.states.OPEN);
        if (this.section) this.section.classList.remove(this.states.SEARCH_INDEX);
        if (this.xElement) this.xElement.classList.remove(this.states.IS_OPEN);
        document.body.style.overflow = '';
      }
    }

    getSectionId() {
      const form = this.querySelector('form[id^="XPredictiveSearch-"]');
      if (form?.id) return form.id.replace('XPredictiveSearch-', '');
      return this.dataset.sectionId || '';
    }

    getShopifySectionId() {
      const sectionEl = this.closest('[id^="shopify-section-"]');
      if (sectionEl?.id) return sectionEl.id.replace('shopify-section-', '');
      return this.dataset.shopifySectionId || '';
    }

    get input() {
      return this.querySelector('input[type="search"]');
    }

    get resetButton() {
      return this.querySelector('button[type="reset"]');
    }

    get searchProductTypes() {
      return this.querySelector('#SearchProductTypes');
    }

    onFocus() {
      const hasQuery = this.getQuery().length > 0;
      document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
      document.documentElement.style.setProperty('--header-bottom-position', `${parseInt(this.modalContainer.getBoundingClientRect().bottom)}px`);
      if (!hasQuery) {
        if (this.searchRecommendationEmpty) this.searchContent?.classList.add('x-hidden');
        return;
      }
      if (!this.searchRecommendationEmpty) this.searchContent?.classList.remove('x-hidden');
      const url = this.setupURL().toString();
      this.renderSection(url);
    }

    getQuery() {
      return this.input.value.trim();
    }

    clear(event = null) {
      event?.preventDefault();
      this.input.value = '';
      this.input.focus();
      this.classList.remove(this.states.OPEN);
      this.removeAttribute('results');
      if (this.searchRecommendationEmpty) this.searchContent?.classList.add('x-hidden');
    }

    handleProductTypeChange() {
      const query = this.getQuery();
      if (query.length > 0) this.renderSection(this.setupURL().toString());
    }

    setupURL() {
      const routes = window.Foxify?.Settings?.routes || {};
      const predictiveUrl = routes.predictive_search_url || '/search/suggest';
      const shopUrl = window.shopUrl || routes.base_url || window.location.origin;
      const url = new URL(`${shopUrl}${predictiveUrl}`);
      let search_term = this.getQuery();
      if (this.searchProductTypes?.value) {
        search_term = `product_type:${this.searchProductTypes.value} AND ${encodeURIComponent(search_term)}`;
      }
      url.searchParams.set('q', search_term);
      url.searchParams.set('resources[limit]', this.dataset.resultsLimit || 3);
      url.searchParams.set('resources[limit_scope]', 'each');
      url.searchParams.set('section_id', this.getShopifySectionId());
      return url;
    }

    onChange() {
      if (this.getQuery().length === 0) {
        this.clear();
        return;
      }
      this.renderSection(this.setupURL().toString());
    }

    renderSection(url) {
      this.cachedMap.has(url) ? this.renderSectionFromCache(url) : this.renderSectionFromFetch(url);
    }

    renderSectionFromCache(url) {
      const responseText = this.cachedMap.get(url);
      this.renderSearchResults(responseText);
      this.setAttribute('results', '');
    }

    renderSectionFromFetch(url) {
      this.setLoadingState(true);
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error('Network response was not ok');
          return res.text();
        })
        .then((responseText) => {
          this.renderSearchResults(responseText);
          this.cachedMap.set(url, responseText);
        })
        .catch((err) => {
          console.error('Error fetching data: ', err);
          this.setAttribute('error', 'Failed to load data');
        })
        .finally(() => this.setLoadingState(false));
    }

    renderSearchResults(responseText) {
      const id = 'XPredictiveSearchResults-' + this.getSectionId();
      const targetElement = document.getElementById(id);
      if (!targetElement) {
        console.error(`Element with id '${id}' not found in the document.`);
        return;
      }
      const parser = new DOMParser();
      const parsedDoc = parser.parseFromString(responseText, 'text/html');
      const contentElement = parsedDoc.getElementById(id);
      if (!contentElement) {
        console.error(`Element with id '${id}' not found in the parsed response.`);
        return;
      }
      this.searchContent?.classList.remove('x-hidden');
      targetElement.innerHTML = contentElement.innerHTML;
      if (this.modal?.classList.contains(MODAL_OPEN_CLASS)) this.classList.add(this.states.OPEN);
    }

    handleClickOutside(event) {
      const target = event.target;
      if (!this.modal?.classList.contains(MODAL_OPEN_CLASS)) return;
      if (this.contains(target)) return;
      this.closeModal();
    }

    handleKeydown(event) {
      if (event.key === 'Escape' && this.modal?.classList.contains(MODAL_OPEN_CLASS)) {
        this.closeModal();
      }
    }

    setLoadingState(isLoading) {
      const spinner = this.resetButton?.querySelector('.x-loading__spinner');
      if (isLoading) {
        this.setAttribute('loading', 'true');
        this.resetButton?.classList.add(this.states.LOADING);
        spinner?.classList.remove('x-hidden');
      } else {
        this.removeAttribute('loading');
        this.resetButton?.classList.remove(this.states.LOADING);
        this.setAttribute('results', 'true');
        spinner?.classList.add('x-hidden');
      }
    }
  }
  customElements.define('x-predictive-search', XPredictiveSearch);
}
