// ═══════════════════════════════════════════════════════════════════════════
// Jarble iOS 26 Interactive Slide-to-Open & Slide-to-Close Gesture Engine
// ═══════════════════════════════════════════════════════════════════════════

(function installIOSSlideDrawerModalEngine() {
  const STYLE_ID = 'jarbleIOSSlideDrawerModalStyle';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* iOS Sheet & Modal Presentation Enhancements */
      .overlay {
        transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 0.28s ease;
        will-change: opacity, backdrop-filter;
      }

      .overlay.closing {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      .overlay .modal-card {
        will-change: transform, opacity;
        touch-action: pan-y;
        transform-origin: bottom center;
        transition: transform 0.34s cubic-bezier(0.18, 0.9, 0.3, 1), opacity 0.28s ease;
      }

      .overlay .modal-card.is-dragging {
        transition: none !important;
        cursor: grabbing !important;
      }

      .overlay .modal-card.anim-slide-in-up {
        animation: iosModalSlideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      }

      .overlay .modal-card.anim-slide-out-down {
        animation: iosModalSlideDown 0.26s cubic-bezier(0.2, 0.9, 0.3, 1) forwards !important;
      }

      @keyframes iosModalSlideUp {
        0% { transform: translate3d(0, 60px, 0) scale(0.96); opacity: 0; }
        100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
      }

      @keyframes iosModalSlideDown {
        0% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
        100% { transform: translate3d(0, 110%, 0) scale(0.95); opacity: 0; }
      }

      /* iOS Sheet Grabber Bar */
      .ios-modal-grab-handle {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 8px 0 10px;
        cursor: grab;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        flex-shrink: 0;
      }

      .ios-modal-grab-pill {
        width: 40px;
        height: 5px;
        border-radius: 999px;
        background: var(--ink);
        opacity: 0.22;
        transition: opacity 0.2s ease, width 0.2s ease, transform 0.2s ease;
      }

      .ios-modal-grab-handle:hover .ios-modal-grab-pill,
      .overlay .modal-card.is-dragging .ios-modal-grab-pill {
        opacity: 0.55;
        width: 48px;
      }

      /* iOS Interactive Edge Swipe Back for Fullscreen Subpages */
      .page {
        will-change: transform, opacity;
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
      }

      .page.is-edge-swiping {
        transition: none !important;
        box-shadow: -12px 0 32px rgba(0, 0, 0, 0.15) !important;
      }

      /* Smooth Interactive Slider Switches */
      .switch {
        touch-action: pan-x;
        user-select: none;
        -webkit-user-select: none;
      }
      .switch .slider {
        transition: background-color 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .switch .slider::before {
        transition: transform 0.28s cubic-bezier(0.18, 0.9, 0.3, 1.15), width 0.2s ease !important;
      }
      .switch.is-dragging .slider::before {
        transition: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Map to store cleanup functions
  const boundModals = new WeakSet();

  /**
   * Attach Pull-Down / Slide-to-Close gesture to a modal card
   */
  function attachSlideToCloseToModal(modalCard, overlayEl) {
    if (!modalCard || boundModals.has(modalCard)) return;
    boundModals.add(modalCard);

    // Ensure there is a top grabber handle
    if (!modalCard.querySelector('.ios-modal-grab-handle')) {
      const handle = document.createElement('div');
      handle.className = 'ios-modal-grab-handle';
      handle.innerHTML = '<div class="ios-modal-grab-pill"></div>';
      modalCard.insertBefore(handle, modalCard.firstChild);
    }

    let startY = 0;
    let startX = 0;
    let currentY = 0;
    let startTime = 0;
    let isDragging = false;
    let isVertical = null;
    let initialScrollTop = 0;

    function onPointerDown(e) {
      // Do not start drag on buttons, inputs, links
      if (e.target.closest('button, a, input, select, textarea, .switch')) {
        return;
      }

      // Check if target is in the handle or header, or if scrolled to top
      const isHandle = !!e.target.closest('.ios-modal-grab-handle, .modal-header, .deck-modal-header');
      const scrollTop = modalCard.scrollTop || 0;

      if (!isHandle && scrollTop > 4) {
        return; // Let user scroll inside the card
      }

      startY = e.clientY;
      startX = e.clientX;
      currentY = startY;
      startTime = Date.now();
      initialScrollTop = scrollTop;
      isDragging = true;
      isVertical = isHandle ? true : null;
    }

    function onPointerMove(e) {
      if (!isDragging) return;

      const dy = e.clientY - startY;
      const dx = e.clientX - startX;

      if (isVertical === null) {
        const absY = Math.abs(dy);
        const absX = Math.abs(dx);
        if (absX < 6 && absY < 6) return;

        if (absY > absX) {
          // If pulling down when at top of card, lock vertical drag
          if (dy > 0 && (modalCard.scrollTop || 0) <= 2) {
            isVertical = true;
            modalCard.classList.add('is-dragging');
          } else {
            isVertical = false;
            isDragging = false;
            return;
          }
        } else {
          isVertical = false;
          isDragging = false;
          return;
        }
      }

      if (!isVertical) return;

      // When dragging down past top, prevent page bounce and scroll
      if (dy > 0) {
        if (e.cancelable) e.preventDefault();

        // 1:1 translation with smooth damping
        const translateY = dy;
        const scale = Math.max(0.94, 1 - (dy / 3000));
        modalCard.style.transform = `translate3d(0, ${translateY}px, 0) scale(${scale})`;

        // Fade backdrop overlay slightly
        if (overlayEl) {
          const opacity = Math.max(0.2, 1 - (dy / 500));
          overlayEl.style.backgroundColor = `rgba(0, 0, 0, ${0.45 * opacity})`;
        }
      } else {
        // Elastic rubber band when dragging up
        const elasticY = -Math.pow(Math.abs(dy), 0.75) * 1.5;
        modalCard.style.transform = `translate3d(0, ${elasticY}px, 0)`;
      }
    }

    function onPointerUp(e) {
      if (!isDragging) return;
      isDragging = false;
      modalCard.classList.remove('is-dragging');

      if (!isVertical) return;

      const dy = e.clientY - startY;
      const dt = Math.max(1, Date.now() - startTime);
      const velocityY = dy / dt; // px/ms

      // If dragged down > 80px or flicked down fast (> 0.4 px/ms)
      const shouldDismiss = (dy > 80 || (velocityY > 0.4 && dy > 25));

      if (shouldDismiss) {
        // Smooth slide down exit
        modalCard.classList.add('anim-slide-out-down');
        if (overlayEl) overlayEl.classList.add('closing');

        setTimeout(() => {
          modalCard.classList.remove('anim-slide-out-down');
          modalCard.style.transform = '';
          if (overlayEl) {
            overlayEl.classList.remove('closing');
            overlayEl.style.backgroundColor = '';
            if (typeof window.closeO === 'function' && overlayEl.id) {
              window.closeO(overlayEl.id);
            } else {
              overlayEl.classList.remove('open');
            }
          }
        }, 240);
      } else {
        // Spring back smoothly
        modalCard.style.transition = 'transform 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.25)';
        modalCard.style.transform = 'translate3d(0, 0, 0) scale(1)';
        if (overlayEl) {
          overlayEl.style.transition = 'background-color 0.3s ease';
          overlayEl.style.backgroundColor = '';
        }
        setTimeout(() => {
          modalCard.style.transition = '';
          if (overlayEl) overlayEl.style.transition = '';
        }, 380);
      }
    }

    modalCard.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
  }

  /**
   * Observe all modal overlays in the DOM and attach gestures
   */
  function scanAndBindModals() {
    const overlays = document.querySelectorAll('.overlay');
    overlays.forEach(overlay => {
      const card = overlay.querySelector('.modal-card') || overlay.querySelector('.deck-form-modal') || overlay.firstElementChild;
      if (card) {
        attachSlideToCloseToModal(card, overlay);
      }
    });
  }

  /**
   * Attach Edge Swipe-to-Go-Back for Subpages (iOS Edge Back Gesture)
   */
  function setupEdgeSwipeBack() {
    const subpages = [
      { id: 'pg-deck-overview', back: () => window.nav && window.nav('decks') },
      { id: 'pg-deck-cards', back: () => window.nav && window.nav(window.prevDeckCardsPage || 'decks') },
      { id: 'pg-study-deck-select', back: () => window.nav && window.nav('home') },
      { id: 'pg-study-word-select', back: () => window.nav && window.nav('study-deck-select') },
      { id: 'pg-learn', back: () => window.nav && window.nav(window.prevPage || 'decks') },
      { id: 'pg-fc', back: () => window.nav && window.nav(window.prevPage || 'decks') }
    ];

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isEdgeDrag = false;
    let activeSubpage = null;
    let backAction = null;
    let startTime = 0;

    function getActiveSubpage() {
      for (const item of subpages) {
        const el = document.getElementById(item.id);
        if (el && el.classList.contains('active')) {
          return { el, back: item.back };
        }
      }
      return null;
    }

    window.addEventListener('pointerdown', (e) => {
      // Don't trigger if a modal overlay is open
      if (document.querySelector('.overlay.open')) return;

      const sub = getActiveSubpage();
      if (!sub) return;

      // Check if drag starts from the left edge (0-36px) or header top bar
      const isLeftEdge = e.clientX <= 38;
      const isTopHeader = !!e.target.closest('.header, .top-bar, .sub-header, .fc-topbar');

      if (!isLeftEdge && !isTopHeader) return;

      // Avoid buttons/inputs
      if (e.target.closest('button, a, input, select, textarea, .switch, .fc-card-inner')) return;

      startX = e.clientX;
      startY = e.clientY;
      currentX = startX;
      startTime = Date.now();
      isEdgeDrag = true;
      activeSubpage = sub.el;
      backAction = sub.back;
    }, { passive: true });

    window.addEventListener('pointermove', (e) => {
      if (!isEdgeDrag || !activeSubpage) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 15 && dx < 20) {
        // Vertical scrolling intent
        isEdgeDrag = false;
        activeSubpage.classList.remove('is-edge-swiping');
        activeSubpage.style.transform = '';
        return;
      }

      if (dx > 5) {
        if (e.cancelable) e.preventDefault();
        activeSubpage.classList.add('is-edge-swiping');
        const translateX = Math.max(0, dx);
        const opacity = Math.max(0.75, 1 - (dx / 1200));
        activeSubpage.style.transform = `translate3d(${translateX}px, 0, 0)`;
        activeSubpage.style.opacity = opacity.toString();
      }
    }, { passive: false });

    window.addEventListener('pointerup', (e) => {
      if (!isEdgeDrag || !activeSubpage) return;
      isEdgeDrag = false;
      activeSubpage.classList.remove('is-edge-swiping');

      const dx = e.clientX - startX;
      const dt = Math.max(1, Date.now() - startTime);
      const velocityX = dx / dt;

      const shouldGoBack = (dx > 90 || (velocityX > 0.42 && dx > 30));

      if (shouldGoBack && typeof backAction === 'function') {
        activeSubpage.style.transition = 'transform 0.24s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.24s ease';
        activeSubpage.style.transform = 'translate3d(100%, 0, 0)';
        activeSubpage.style.opacity = '0';

        setTimeout(() => {
          activeSubpage.style.transition = '';
          activeSubpage.style.transform = '';
          activeSubpage.style.opacity = '';
          backAction();
        }, 220);
      } else {
        // Spring back
        activeSubpage.style.transition = 'transform 0.32s cubic-bezier(0.18, 0.9, 0.3, 1.2), opacity 0.3s ease';
        activeSubpage.style.transform = 'translate3d(0, 0, 0)';
        activeSubpage.style.opacity = '1';
        setTimeout(() => {
          activeSubpage.style.transition = '';
        }, 320);
      }
    }, { passive: true });
  }

  /**
   * Interactive Drag-to-Slide for Switch Toggles
   */
  function setupInteractiveSwitches() {
    document.addEventListener('pointerdown', (e) => {
      const switchEl = e.target.closest('.switch');
      if (!switchEl) return;

      const input = switchEl.querySelector('input[type="checkbox"]');
      if (!input || input.disabled) return;

      let startX = e.clientX;
      let hasDragged = false;

      function onMove(me) {
        const dx = me.clientX - startX;
        if (Math.abs(dx) > 6) {
          hasDragged = true;
          switchEl.classList.add('is-dragging');
        }
      }

      function onUp(ue) {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        switchEl.classList.remove('is-dragging');

        if (hasDragged) {
          const dx = ue.clientX - startX;
          if (dx > 8 && !input.checked) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (dx < -8 && input.checked) {
            input.checked = false;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp, { passive: true });
      window.addEventListener('pointercancel', onUp, { passive: true });
    }, { passive: true });
  }

  /**
   * Wrap openO to ensure new modals get animated slide-in and gesture binding
   */
  function enhanceModalOpenClose() {
    const origOpenO = window.openO;
    window.openO = function (id) {
      if (typeof origOpenO === 'function') origOpenO(id);
      const overlay = document.getElementById(id);
      if (overlay) {
        overlay.classList.remove('closing');
        overlay.style.backgroundColor = '';
        const card = overlay.querySelector('.modal-card') || overlay.querySelector('.deck-form-modal') || overlay.firstElementChild;
        if (card) {
          card.style.transform = '';
          card.classList.remove('anim-slide-out-down');
          card.classList.add('anim-slide-in-up');
          attachSlideToCloseToModal(card, overlay);
          setTimeout(() => card.classList.remove('anim-slide-in-up'), 320);
        }
      }
    };

    const origCloseO = window.closeO;
    window.closeO = function (id) {
      const overlay = document.getElementById(id);
      if (overlay && overlay.classList.contains('open')) {
        const card = overlay.querySelector('.modal-card') || overlay.querySelector('.deck-form-modal') || overlay.firstElementChild;
        if (card) {
          card.classList.add('anim-slide-out-down');
          overlay.classList.add('closing');
          setTimeout(() => {
            card.classList.remove('anim-slide-out-down');
            card.style.transform = '';
            overlay.classList.remove('closing');
            overlay.style.backgroundColor = '';
            if (typeof origCloseO === 'function') origCloseO(id);
            else overlay.classList.remove('open');
          }, 220);
          return;
        }
      }
      if (typeof origCloseO === 'function') origCloseO(id);
    };
  }

  function init() {
    injectStyles();
    scanAndBindModals();
    setupEdgeSwipeBack();
    setupInteractiveSwitches();
    enhanceModalOpenClose();

    // Re-scan when DOM changes (e.g. dynamically injected modals)
    const observer = new MutationObserver(() => scanAndBindModals());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.JarbleIOSSlideDrawer = {
    init,
    scanAndBindModals,
    attachSlideToCloseToModal
  };
})();
