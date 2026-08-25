// WordJar UI Standardize V1
// Normalizes key button sizing so the interface feels consistent.

(function installUIStandardize() {
  if (window.__wordjarUIStandardizeInstalled) return;
  window.__wordjarUIStandardizeInstalled = true;

  function injectStyles() {
    if (document.getElementById('uiStandardizeStyle')) return;
    const style = document.createElement('style');
    style.id = 'uiStandardizeStyle';
    style.textContent = `
      .ph { min-height:52px; align-items:center; }
      .ph-title, .home-title { line-height:1.05; }
      .btn, .btn-s, .btn-p, .dict-add-btn, .tts-action-btn { box-sizing:border-box; }
      .btn.btn-s, .btn.btn-p { min-height:42px; }
      .dict-add-btn { width:44px !important; height:44px !important; min-width:44px !important; padding:0 !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; }
      .search-row { align-items:center; gap:10px; }
      .dict-filter-summary { min-height:38px; display:flex; align-items:center; box-sizing:border-box; }
      #btnSelectCards { min-width:56px; height:36px; display:inline-flex; align-items:center; justify-content:center; border-radius:12px; }
    `;
    document.head.appendChild(style);
  }

  function normalizeTopNavAccessibility() {
    const labels = {
      'tb-home': 'Dashboard',
      'tb-decks': 'Decks',
      'tb-words': 'Dictionary',
      'tb-account': 'Account'
    };
    Object.entries(labels).forEach(([id, label]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.setAttribute('aria-label', label);
      btn.title = label;
    });
  }

  injectStyles();
  normalizeTopNavAccessibility();
  setTimeout(normalizeTopNavAccessibility, 300);
  window.WordJarUIStandardize = { normalizeTopNavAccessibility };
})();
