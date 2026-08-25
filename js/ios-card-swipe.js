// ═══════════════════════════════════════════════════════════════════════════
// Jarble iOS Gesture Engine — Fluid Left/Right Card Swiping (iOS 26 Style)
// ═══════════════════════════════════════════════════════════════════════════

(function installIOSCardSwipe() {
  const STYLE_ID = 'jarbleIOSSwipeStyle';
  let isTransitioning = false;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* iOS Card Container Optimization */
      #pg-learn .fc-scene,
      #pg-fc .fc-scene {
        position: relative;
        touch-action: pan-y;
        user-select: none;
        -webkit-user-select: none;
        overflow: visible !important;
      }

      #pg-learn .fc-card-inner,
      #pg-fc .fc-card-inner {
        position: relative;
        will-change: transform, opacity, box-shadow;
        transform-origin: center center;
        transition: transform 0.36s cubic-bezier(0.18, 0.9, 0.3, 1), box-shadow 0.25s ease, opacity 0.25s ease;
      }

      #pg-learn .fc-card-inner.is-dragging,
      #pg-fc .fc-card-inner.is-dragging {
        transition: none !important;
        cursor: grabbing !important;
        box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.18), 0 8px 20px -6px rgba(0, 0, 0, 0.12) !important;
      }

      /* iOS Dynamic Swipe Cue Pills */
      .ios-swipe-indicator {
        position: absolute;
        top: 20px;
        z-index: 50;
        pointer-events: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.2px;
        opacity: 0;
        transform: scale(0.85);
        transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.18, 0.9, 0.3, 1);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }

      .ios-swipe-indicator.cue-next {
        right: 20px;
        background: rgba(9, 9, 11, 0.88);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.15);
      }

      .ios-swipe-indicator.cue-prev {
        left: 20px;
        background: rgba(244, 244, 245, 0.92);
        color: #18181b;
        border: 1px solid rgba(0, 0, 0, 0.1);
      }

      .ios-swipe-indicator.cue-learned {
        right: 20px;
        background: rgba(16, 185, 129, 0.92);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .ios-swipe-indicator.cue-bounce {
        left: 20px;
        background: rgba(239, 68, 68, 0.9);
        color: #ffffff;
      }

      .ios-swipe-indicator.active {
        opacity: 1;
        transform: scale(1);
      }

      /* Subtle Swipe Hint Bar under card on study screen */
      .ios-swipe-hint-bar {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--ink3);
        margin-top: 6px;
        margin-bottom: 2px;
        opacity: 0.75;
      }
      .ios-swipe-hint-bar svg {
        width: 14px;
        height: 14px;
      }

      /* Slide Out / Slide In Transition Keyframes */
      @keyframes iosCardSlideOutLeft {
        0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 1; }
        100% { transform: translate3d(-125%, 0, 0) rotate(-10deg); opacity: 0; }
      }

      @keyframes iosCardSlideInRight {
        0% { transform: translate3d(80px, 0, 0) scale(0.95); opacity: 0; }
        100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
      }

      @keyframes iosCardSlideOutRight {
        0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 1; }
        100% { transform: translate3d(125%, 0, 0) rotate(10deg); opacity: 0; }
      }

      @keyframes iosCardSlideInLeft {
        0% { transform: translate3d(-80px, 0, 0) scale(0.95); opacity: 0; }
        100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
      }

      .ios-anim-slide-out-left {
        animation: iosCardSlideOutLeft 0.24s cubic-bezier(0.2, 0.9, 0.3, 1) forwards !important;
      }

      .ios-anim-slide-in-right {
        animation: iosCardSlideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      }

      .ios-anim-slide-out-right {
        animation: iosCardSlideOutRight 0.24s cubic-bezier(0.2, 0.9, 0.3, 1) forwards !important;
      }

      .ios-anim-slide-in-left {
        animation: iosCardSlideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Helper to animate card transition before calling action
   */
  function triggerAnimatedTransition(cardEl, direction, actionFn) {
    if (!cardEl || isTransitioning) {
      if (typeof actionFn === 'function') actionFn();
      return;
    }

    isTransitioning = true;
    const outClass = direction === 'next' ? 'ios-anim-slide-out-left' : 'ios-anim-slide-out-right';
    const inClass = direction === 'next' ? 'ios-anim-slide-in-right' : 'ios-anim-slide-in-left';

    cardEl.classList.remove('ios-anim-slide-out-left', 'ios-anim-slide-in-right', 'ios-anim-slide-out-right', 'ios-anim-slide-in-left');
    cardEl.classList.add(outClass);

    setTimeout(() => {
      cardEl.classList.remove(outClass);
      if (typeof actionFn === 'function') {
        actionFn();
      }

      cardEl.classList.add(inClass);
      setTimeout(() => {
        cardEl.classList.remove(inClass);
        cardEl.style.transform = '';
        cardEl.style.opacity = '';
        isTransitioning = false;
      }, 300);
    }, 220);
  }

  /**
   * Attach iOS gesture drag handler to a card scene
   */
  function attachIOSSwipeGesture(sceneEl, options) {
    if (!sceneEl || sceneEl.dataset.iosSwipeBound === 'true') return;
    sceneEl.dataset.iosSwipeBound = 'true';

    let card = sceneEl.querySelector('.fc-card-inner') || sceneEl;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let startTime = 0;
    let isDragging = false;
    let isHorizontal = null; // null: undecided, true: horizontal lock, false: vertical lock
    let indicatorEl = null;

    function getIndicator() {
      if (!indicatorEl) {
        indicatorEl = document.createElement('div');
        indicatorEl.className = 'ios-swipe-indicator';
        sceneEl.appendChild(indicatorEl);
      }
      return indicatorEl;
    }

    function showIndicator(type, text, iconHtml) {
      const ind = getIndicator();
      ind.className = `ios-swipe-indicator active cue-${type}`;
      ind.innerHTML = `${iconHtml || ''} <span>${text}</span>`;
    }

    function hideIndicator() {
      if (indicatorEl) {
        indicatorEl.className = 'ios-swipe-indicator';
        indicatorEl.style.opacity = '0';
      }
    }

    function onPointerDown(e) {
      if (isTransitioning) return;
      // Do not initiate drag on buttons, links, or inputs
      if (e.target.closest('button, a, input, select, textarea, .tts-action-btn')) {
        return;
      }

      // Check if this mode allows swiping
      if (typeof options.canSwipe === 'function' && !options.canSwipe()) {
        return;
      }

      startX = e.clientX;
      startY = e.clientY;
      currentX = startX;
      currentY = startY;
      startTime = Date.now();
      isDragging = true;
      isHorizontal = null;

      card = sceneEl.querySelector('.fc-card-inner') || sceneEl;
    }

    function onPointerMove(e) {
      if (!isDragging) return;

      currentX = e.clientX;
      currentY = e.clientY;
      const dx = currentX - startX;
      const dy = currentY - startY;

      // Determine directional intent
      if (isHorizontal === null) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX < 6 && absY < 6) return;

        if (absX > absY) {
          isHorizontal = true;
          card.classList.add('is-dragging');
        } else {
          isHorizontal = false;
          isDragging = false;
          return;
        }
      }

      if (!isHorizontal) return;

      // Prevent native page scrolling while dragging card horizontally
      if (e.cancelable) {
        e.preventDefault();
      }

      // Boundary resistance calculation (rubber-banding on first card right-drag)
      let effectiveX = dx;
      const isAtStart = typeof options.isAtStart === 'function' && options.isAtStart();
      if (isAtStart && dx > 0) {
        // Elastic resistance formula
        effectiveX = Math.pow(dx, 0.8) * 1.8;
      }

      const rotateDeg = (effectiveX / 14) * 0.4;
      const scale = Math.min(1.025, 1 + Math.abs(effectiveX) / 1600);

      card.style.transform = `translate3d(${effectiveX}px, 0, 0) rotate(${rotateDeg}deg) scale(${scale})`;

      // Dynamic indicator cue
      const absDx = Math.abs(effectiveX);
      if (effectiveX < -40) {
        if (effectiveX < -90 && options.mode === 'learn') {
          showIndicator('learned', 'Learned ✓');
        } else {
          showIndicator('next', 'Next', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><polyline points="9 18 15 12 9 6"/></svg>');
        }
        if (indicatorEl) indicatorEl.style.opacity = Math.min(1, absDx / 80).toString();
      } else if (effectiveX > 40) {
        if (isAtStart) {
          showIndicator('bounce', 'First Word', '•');
        } else {
          showIndicator('prev', 'Prev', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><polyline points="15 18 9 12 15 6"/></svg>');
        }
        if (indicatorEl) indicatorEl.style.opacity = Math.min(1, absDx / 80).toString();
      } else {
        hideIndicator();
      }
    }

    function onPointerUp(e) {
      if (!isDragging) return;
      isDragging = false;
      card.classList.remove('is-dragging');
      hideIndicator();

      if (!isHorizontal) return;

      const dx = currentX - startX;
      const dt = Math.max(1, Date.now() - startTime);
      const velocityX = dx / dt;
      const absDx = Math.abs(dx);

      const isSwipeLeft = (dx < -65 || velocityX < -0.42) && dx < -20;
      const isSwipeRight = (dx > 65 || velocityX > 0.42) && dx > 20;
      const isAtStart = typeof options.isAtStart === 'function' && options.isAtStart();

      if (isSwipeLeft) {
        // Next card transition
        triggerAnimatedTransition(card, 'next', () => {
          if (typeof options.onSwipeLeft === 'function') {
            options.onSwipeLeft();
          }
        });
      } else if (isSwipeRight && !isAtStart) {
        // Previous card transition
        triggerAnimatedTransition(card, 'prev', () => {
          if (typeof options.onSwipeRight === 'function') {
            options.onSwipeRight();
          }
        });
      } else {
        // Spring back smoothly into place
        card.style.transition = 'transform 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        card.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
        setTimeout(() => {
          card.style.transition = '';
        }, 420);
      }
    }

    sceneEl.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
  }

  /**
   * Setup gestures for Study / Recite Mode (#pg-learn)
   */
  function setupStudyModeGestures() {
    const scene = document.querySelector('#pg-learn .fc-scene');
    if (!scene) return;

    attachIOSSwipeGesture(scene, {
      mode: 'learn',
      canSwipe: () => {
        return Array.isArray(lList) && lList.length > 0 && lI < lList.length;
      },
      isAtStart: () => lI === 0,
      onSwipeLeft: () => {
        if (typeof window.nextLearn === 'function') {
          window.nextLearn();
        }
      },
      onSwipeRight: () => {
        if (typeof window.prevLearn === 'function') {
          window.prevLearn();
        }
      }
    });

    // Intercept button clicks to add iOS slide transitions
    const btnPrev = document.getElementById('btnPrevLearn');
    const btnSkip = document.getElementById('btnSkipLearn');
    const btnLearned = document.getElementById('btnMarkLearned');
    const card = scene.querySelector('.fc-card-inner');

    if (btnPrev && !btnPrev.dataset.iosAnimBound) {
      btnPrev.dataset.iosAnimBound = 'true';
      const origOnclick = btnPrev.onclick;
      btnPrev.onclick = function (ev) {
        if (lI > 0) {
          triggerAnimatedTransition(card, 'prev', () => {
            if (typeof origOnclick === 'function') origOnclick.call(this, ev);
            else if (typeof window.prevLearn === 'function') window.prevLearn();
          });
        }
      };
    }

    if (btnSkip && !btnSkip.dataset.iosAnimBound) {
      btnSkip.dataset.iosAnimBound = 'true';
      const origOnclick = btnSkip.onclick;
      btnSkip.onclick = function (ev) {
        triggerAnimatedTransition(card, 'next', () => {
          if (typeof origOnclick === 'function') origOnclick.call(this, ev);
          else if (typeof window.skipLearn === 'function') window.skipLearn();
        });
      };
    }

    if (btnLearned && !btnLearned.dataset.iosAnimBound) {
      btnLearned.dataset.iosAnimBound = 'true';
      const origOnclick = btnLearned.onclick;
      btnLearned.onclick = function (ev) {
        triggerAnimatedTransition(card, 'next', () => {
          if (typeof origOnclick === 'function') origOnclick.call(this, ev);
          else if (typeof window.nextLearn === 'function') window.nextLearn();
        });
      };
    }
  }

  /**
   * Setup gestures for Flashcard Mode (#pg-fc)
   */
  function setupFlashcardModeGestures() {
    const scene = document.querySelector('#pg-fc .fc-scene');
    if (!scene) return;

    attachIOSSwipeGesture(scene, {
      mode: 'fc',
      canSwipe: () => Array.isArray(fcQ) && fcQ.length > 0 && fcI < fcQ.length,
      isAtStart: () => false,
      onSwipeLeft: () => {
        if (typeof window.skipFC === 'function') {
          window.skipFC();
        } else if (typeof window.rateFC === 'function') {
          window.rateFC(4); // Good
        }
      },
      onSwipeRight: () => {
        if (typeof window.revealFC === 'function') {
          window.revealFC();
        }
      }
    });
  }

  // Keyboard navigation shortcuts for desktop/iPad with keyboard
  function setupKeyboardNavigation() {
    if (window._iosSwipeKeyBound) return;
    window._iosSwipeKeyBound = true;

    window.addEventListener('keydown', (e) => {
      // Don't intercept when typing in search or inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      if (curPage === 'learn') {
        const scene = document.querySelector('#pg-learn .fc-scene');
        const card = scene?.querySelector('.fc-card-inner');

        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          triggerAnimatedTransition(card, 'next', () => {
            if (typeof window.nextLearn === 'function') window.nextLearn();
          });
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (lI > 0) {
            triggerAnimatedTransition(card, 'prev', () => {
              if (typeof window.prevLearn === 'function') window.prevLearn();
            });
          }
        } else if (e.key === 's' || e.key === 'S') {
          if (typeof playLearnWord === 'function') playLearnWord(e);
        }
      }
    });
  }

  function init() {
    injectStyles();
    setupStudyModeGestures();
    setupFlashcardModeGestures();
    setupKeyboardNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Hook into page renders to ensure gestures stay active
  const origRenderLearn = window.renderLearn;
  window.renderLearn = function () {
    if (typeof origRenderLearn === 'function') origRenderLearn();
    setupStudyModeGestures();
  };

  const origRenderFC = window.renderFC;
  window.renderFC = function () {
    if (typeof origRenderFC === 'function') origRenderFC();
    setupFlashcardModeGestures();
  };

  window.JarbleIOSSwipe = {
    init,
    setupStudyModeGestures,
    setupFlashcardModeGestures,
    triggerAnimatedTransition
  };
})();
