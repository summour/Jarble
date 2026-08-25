// WordJar iOS-style Drag-to-Select Engine
// -----------------------------------------------------------------------------
// Provides native-feeling iOS multi-item drag selection for:
// 1. Study Mode Word Selection (#studyWordSelectList)
// 2. Deck Cards Batch Select Mode (#deckCardsList)
//
// Key features:
// - Drag vertically or diagonally across cards/checkboxes to select/deselect
// - Determines initial action (Select or Deselect) based on the first touched card
// - Spatial interpolation to catch all cards even during high-speed finger swipes
// - Smooth auto-scroll when dragging near container top/bottom edges
// - Micro-haptic tactile feedback (navigator.vibrate) on item state change
// - Prevents synthetic release click event from toggling the last card
// -----------------------------------------------------------------------------

(function installWordJarDragToSelect() {
  if (window.__wordjarDragToSelectInstalled) return;
  window.__wordjarDragToSelectInstalled = true;

  // Inject iOS drag styling
  const style = document.createElement('style');
  style.id = 'wordjarDragSelectStyles';
  style.textContent = `
    .ios-drag-hint-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      margin: 4px 0 10px 0;
      background: var(--sur2);
      border: 1px dashed var(--bdr2);
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink2);
      user-select: none;
      -webkit-user-select: none;
      transition: opacity 0.2s ease;
    }
    .ios-drag-hint-banner svg {
      width: 15px;
      height: 15px;
      flex-shrink: 0;
      stroke-width: 2;
    }
    .drag-selecting-active {
      user-select: none !important;
      -webkit-user-select: none !important;
      cursor: crosshair !important;
      touch-action: none !important;
    }
    .drag-selecting-active .study-word-item,
    .drag-selecting-active .deck-card-selectable {
      user-select: none !important;
      -webkit-user-select: none !important;
      touch-action: none !important;
    }
    .select-circle.pop-anim {
      animation: selectPop 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes selectPop {
      0% { transform: scale(0.85); }
      50% { transform: scale(1.18); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);

  // Core Drag Select State
  let activeDragContainer = null;
  let isDragging = false;
  let hasMovedEnough = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let targetSelectState = true;
  let modifiedItemIds = new Set();
  let autoScrollRafId = null;
  let scrollContainer = null;
  let activeConfig = null;
  let suppressNextClick = false;

  // Configurations for different lists
  const listConfigs = {
    study: {
      containerId: 'studyWordSelectList',
      scrollContainerId: 'pg-study-word-select',
      itemSelector: '.study-word-item',
      getId: el => el.getAttribute('data-word-id') || el.dataset.wordId,
      isSelected: id => window.isStudyWordSelected ? window.isStudyWordSelected(id) : false,
      setSelected: (id, select) => {
        if (window.setStudyWordSelected) window.setStudyWordSelected(id, select);
      },
      updateUI: () => {
        if (window.syncStudySelectionUI) window.syncStudySelectionUI();
      },
      isActive: () => document.getElementById('pg-study-word-select')?.classList.contains('active')
    },
    deck: {
      containerId: 'deckCardsList',
      scrollContainerId: 'pg-deck-cards',
      itemSelector: '.deck-card-selectable',
      getId: el => el.getAttribute('data-card-id') || el.dataset.cardId,
      isSelected: id => (typeof selectedCards !== 'undefined' && selectedCards.has(String(id))),
      setSelected: (id, select) => {
        if (typeof selectedCards !== 'undefined') {
          const sid = String(id);
          if (select) selectedCards.add(sid);
          else selectedCards.delete(sid);
        }
      },
      updateUI: () => {
        if (typeof updateDeckBulkActions === 'function') updateDeckBulkActions();
      },
      isActive: () => (typeof isSelectMode !== 'undefined' && isSelectMode && document.getElementById('pg-deck-cards')?.classList.contains('active'))
    }
  };

  function triggerHaptic() {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(8);
      }
    } catch (e) {}
  }

  function getElementAtPoint(clientX, clientY, itemSelector) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    return el.closest(itemSelector);
  }

  function getItemsInYRange(container, itemSelector, y1, y2) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const items = Array.from(container.querySelectorAll(itemSelector));

    return items.filter(item => {
      const rect = item.getBoundingClientRect();
      // Overlaps vertically
      return rect.bottom >= minY && rect.top <= maxY;
    });
  }

  function applyItemSelection(itemEl, config, selectState) {
    if (!itemEl || !config) return false;
    const id = config.getId(itemEl);
    if (!id || modifiedItemIds.has(id)) return false;

    modifiedItemIds.add(id);
    config.setSelected(id, selectState);

    // Update Item DOM immediately for 60fps responsiveness
    if (config === listConfigs.study) {
      itemEl.classList.toggle('selected', selectState);
      const circle = itemEl.querySelector('.select-circle');
      if (circle) {
        circle.classList.toggle('selected', selectState);
        circle.classList.add('pop-anim');
        setTimeout(() => circle.classList.remove('pop-anim'), 200);
        circle.innerHTML = selectState ? `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ` : '';
      }
    } else if (config === listConfigs.deck) {
      itemEl.classList.toggle('selected-card', selectState);
      const circle = itemEl.querySelector('.select-circle');
      if (circle) {
        circle.classList.toggle('selected', selectState);
        circle.classList.add('pop-anim');
        setTimeout(() => circle.classList.remove('pop-anim'), 200);
        circle.innerHTML = selectState ? `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ` : '';
      }
    }

    triggerHaptic();
    config.updateUI();
    return true;
  }

  function handleAutoScroll() {
    if (!isDragging || !scrollContainer || !activeConfig) return;

    const rect = scrollContainer.getBoundingClientRect();
    const topThreshold = rect.top + 65;
    const bottomThreshold = rect.bottom - 65;
    let scrollDelta = 0;

    if (lastY < topThreshold) {
      const intensity = Math.min(1, Math.max(0.1, (topThreshold - lastY) / 65));
      scrollDelta = -Math.round(intensity * 14);
    } else if (lastY > bottomThreshold) {
      const intensity = Math.min(1, Math.max(0.1, (lastY - bottomThreshold) / 65));
      scrollDelta = Math.round(intensity * 14);
    }

    if (scrollDelta !== 0) {
      scrollContainer.scrollTop += scrollDelta;
      // Evaluate newly scrolled element under finger
      const curItem = getElementAtPoint(lastX, lastY, activeConfig.itemSelector);
      if (curItem) {
        applyItemSelection(curItem, activeConfig, targetSelectState);
      }
    }

    autoScrollRafId = requestAnimationFrame(handleAutoScroll);
  }

  function onDragStart(clientX, clientY, targetEl, config) {
    if (!config.isActive()) return;

    const itemEl = targetEl.closest(config.itemSelector);
    if (!itemEl) return;

    startX = clientX;
    startY = clientY;
    lastX = clientX;
    lastY = clientY;
    hasMovedEnough = false;
    isDragging = true;
    activeConfig = config;
    modifiedItemIds.clear();

    const containerEl = document.getElementById(config.containerId);
    scrollContainer = document.getElementById(config.scrollContainerId);
    activeDragContainer = containerEl;

    // The initial card determines the drag action: if already selected -> deselect; if not -> select
    const startId = config.getId(itemEl);
    const startIsSelected = startId ? config.isSelected(startId) : false;
    targetSelectState = !startIsSelected;

    // Apply immediately to the first card
    applyItemSelection(itemEl, config, targetSelectState);

    // Start auto-scroll loop
    if (autoScrollRafId) cancelAnimationFrame(autoScrollRafId);
    autoScrollRafId = requestAnimationFrame(handleAutoScroll);
  }

  function onDragMove(clientX, clientY, event) {
    if (!isDragging || !activeConfig || !activeDragContainer) return;

    lastX = clientX;
    const prevY = lastY;
    lastY = clientY;

    const dist = Math.hypot(clientX - startX, clientY - startY);
    if (dist > 6) {
      if (!hasMovedEnough) {
        hasMovedEnough = true;
        document.body.classList.add('drag-selecting-active');
        if (activeDragContainer) activeDragContainer.classList.add('drag-selecting-active');
      }
      if (event && event.cancelable) {
        event.preventDefault();
      }
    }

    if (!hasMovedEnough) return;

    // Check all items between previous Y and current Y to prevent skipping during fast swipes
    const items = getItemsInYRange(activeDragContainer, activeConfig.itemSelector, prevY, clientY);
    items.forEach(item => {
      applyItemSelection(item, activeConfig, targetSelectState);
    });
  }

  function onDragEnd() {
    if (!isDragging) return;

    if (autoScrollRafId) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }

    if (hasMovedEnough) {
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 250);
    }

    document.body.classList.remove('drag-selecting-active');
    if (activeDragContainer) activeDragContainer.classList.remove('drag-selecting-active');

    if (activeConfig) {
      activeConfig.updateUI();
    }

    isDragging = false;
    hasMovedEnough = false;
    activeDragContainer = null;
    activeConfig = null;
    modifiedItemIds.clear();
  }

  // Intercept synthetic clicks after drag selection
  window.addEventListener('click', event => {
    if (suppressNextClick) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }
  }, true);

  // Attach Pointer / Touch Listeners to a container
  function bindDragSelectToContainer(containerId, configKey) {
    const container = document.getElementById(containerId);
    if (!container || container.dataset.dragSelectBound === 'true') return;
    container.dataset.dragSelectBound = 'true';

    const config = listConfigs[configKey];

    // Pointer Events (Mouse, Pen, Touch on modern browsers)
    container.addEventListener('pointerdown', event => {
      // Only proceed with primary button or touch
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      if (!config.isActive()) return;

      const item = event.target.closest(config.itemSelector);
      if (!item) return;

      onDragStart(event.clientX, event.clientY, event.target, config);
    }, { passive: true });

    window.addEventListener('pointermove', event => {
      if (isDragging && activeConfig === config) {
        onDragMove(event.clientX, event.clientY, event);
      }
    }, { passive: false });

    window.addEventListener('pointerup', () => {
      if (isDragging && activeConfig === config) onDragEnd();
    }, { passive: true });

    window.addEventListener('pointercancel', () => {
      if (isDragging && activeConfig === config) onDragEnd();
    }, { passive: true });

    // Fallback Touch Events for iOS Webkit
    container.addEventListener('touchstart', event => {
      if (!config.isActive() || event.touches.length > 1) return;
      const touch = event.touches[0];
      const item = event.target.closest(config.itemSelector);
      if (!item) return;

      onDragStart(touch.clientX, touch.clientY, event.target, config);
    }, { passive: true });

    window.addEventListener('touchmove', event => {
      if (isDragging && activeConfig === config && event.touches.length === 1) {
        const touch = event.touches[0];
        onDragMove(touch.clientX, touch.clientY, event);
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (isDragging && activeConfig === config) onDragEnd();
    }, { passive: true });

    window.addEventListener('touchcancel', () => {
      if (isDragging && activeConfig === config) onDragEnd();
    }, { passive: true });
  }

  // Initialize listeners
  function initDragListeners() {
    bindDragSelectToContainer('studyWordSelectList', 'study');
    bindDragSelectToContainer('deckCardsList', 'deck');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDragListeners);
  } else {
    initDragListeners();
  }

  // Public hooks
  window.WordJarDragSelect = {
    bind: bindDragSelectToContainer,
    init: initDragListeners
  };
})();
