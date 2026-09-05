// Jarble Study Auto Run
// Speaks selected fields and advances through a recitation session automatically.
(function installStudyAutoRun() {
  if (window.__jarbleStudyAutoRunInstalled) return;
  window.__jarbleStudyAutoRunInstalled = true;

  const DEFAULTS = {
    autoStart: false,
    speakWord: true,
    speakMeaning: true,
    speakExample: true,
    pauseMs: 500,
    advanceMs: 1800,
    loop: false
  };

  let active = false;
  let timer = null;
  let token = 0;

  function settings() {
    D.settings = D.settings || {};
    D.settings.studyAutoRun = { ...DEFAULTS, ...(D.settings.studyAutoRun || {}) };
    return D.settings.studyAutoRun;
  }

  function saveSettings() {
    if (typeof save === 'function') save();
  }

  function clearRun() {
    token++;
    if (timer) clearTimeout(timer);
    timer = null;
    window.speechSynthesis?.cancel();
  }

  function isStudyVisible() {
    return curPage === 'learn' && Array.isArray(lList) && lI >= 0 && lI < lList.length;
  }

  function speakPieces(pieces, runToken, index = 0) {
    if (!active || runToken !== token || !isStudyVisible()) return;
    if (index >= pieces.length) {
      const delay = Math.max(0, Number(settings().advanceMs) || DEFAULTS.advanceMs);
      timer = setTimeout(() => {
        if (!active || runToken !== token || !isStudyVisible()) return;
        window.skipLearn();
      }, delay);
      return;
    }

    const piece = pieces[index];
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      speakPieces(pieces, runToken, index + 1);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(piece.text);
    utterance.lang = piece.lang;
    utterance.rate = Number(D.profile?.voiceSpeed) || 0.95;

    if (piece.lang.startsWith('en') && typeof getBestVoice === 'function') {
      const voice = getBestVoice(D.profile?.voice || 'en-US');
      if (voice) utterance.voice = voice;
    }

    utterance.onend = () => {
      if (!active || runToken !== token) return;
      const pause = Math.max(0, Number(settings().pauseMs) || 0);
      timer = setTimeout(() => speakPieces(pieces, runToken, index + 1), pause);
    };
    utterance.onerror = utterance.onend;
    window.speechSynthesis.speak(utterance);
  }

  function runCurrentCard() {
    clearRun();
    if (!active || !isStudyVisible()) return;
    const w = lList[lI];
    const config = settings();
    const pieces = [];

    if (config.speakWord && w.word) pieces.push({ text: w.word, lang: D.profile?.voice || 'en-US' });
    if (config.speakMeaning && w.meaning) pieces.push({ text: w.meaning, lang: /[\u0E00-\u0E7F]/.test(w.meaning) ? 'th-TH' : (D.profile?.voice || 'en-US') });
    if (config.speakExample && w.example) pieces.push({ text: w.example, lang: D.profile?.voice || 'en-US' });

    const runToken = token;
    if (pieces.length) speakPieces(pieces, runToken);
    else {
      timer = setTimeout(() => {
        if (active && runToken === token && isStudyVisible()) window.skipLearn();
      }, Math.max(0, Number(config.advanceMs) || DEFAULTS.advanceMs));
    }
  }

  function setActive(next) {
    active = Boolean(next);
    clearRun();
    refreshControl();
    if (active) {
      token++;
      runCurrentCard();
    }
  }

  function refreshControl() {
    const button = document.getElementById('studyAutoRunButton');
    const status = document.getElementById('studyAutoRunStatus');
    if (button) {
      button.textContent = active ? 'Pause Auto Run' : 'Start Auto Run';
      button.classList.toggle('btn-p', active);
      button.classList.toggle('btn-s', !active);
    }
    if (status) status.textContent = active ? 'Reading continuously' : 'Reads the selected fields, then moves to the next word';
  }

  function ensureStudyControl() {
    const area = document.querySelector('#pg-learn #lMain .fc-action-area');
    if (!area || document.getElementById('studyAutoRunControls')) return;
    const wrap = document.createElement('div');
    wrap.id = 'studyAutoRunControls';
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;';
    wrap.innerHTML = '<div style="min-width:0"><div style="font-size:13px;font-weight:800;color:var(--ink)">Auto Run</div><div id="studyAutoRunStatus" style="font-size:11px;color:var(--ink2);margin-top:2px"></div></div><button id="studyAutoRunButton" type="button" class="btn btn-s" style="padding:9px 12px;font-size:12px;white-space:nowrap"></button>';
    area.insertBefore(wrap, area.firstChild);
    document.getElementById('studyAutoRunButton').addEventListener('click', () => setActive(!active));
    refreshControl();
  }

  function addStyle() {
    if (document.getElementById('studyAutoRunStyle')) return;
    const style = document.createElement('style');
    style.id = 'studyAutoRunStyle';
    style.textContent = '#studyAutoRunSettings .auto-run-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-top:1px solid var(--bdr)}#studyAutoRunSettings .auto-run-title{font-size:14px;font-weight:700;color:var(--ink)}#studyAutoRunSettings .auto-run-desc{font-size:12px;color:var(--ink2);line-height:1.35;margin-top:3px}#studyAutoRunSettings select{min-width:92px;padding:8px;border:1px solid var(--bdr);border-radius:10px;background:var(--sur2);color:var(--ink)}';
    document.head.appendChild(style);
  }

  function checkboxRow(key, title, description) {
    return '<div class="auto-run-row"><div><div class="auto-run-title">' + title + '</div><div class="auto-run-desc">' + description + '</div></div><label class="switch"><input type="checkbox" data-auto-run="' + key + '"><span class="slider"></span></label></div>';
  }

  function ensureSettingsPanel() {
    const account = document.getElementById('pg-account');
    if (!account || document.getElementById('studyAutoRunSettings')) return;
    addStyle();

    const panel = document.createElement('div');
    panel.className = 'settings-card';
    panel.id = 'studyAutoRunSettings';
    panel.innerHTML =
      '<div class="settings-card-title">Study Auto Run</div>' +
      '<div class="format-label" style="margin-bottom:10px">Speaks selected fields and moves through cards automatically while Jarble is open. Mobile systems may pause web audio when the screen is locked.</div>' +
      checkboxRow('autoStart', 'Start automatically', 'Begin Auto Run when a Recite session starts.') +
      checkboxRow('speakWord', 'Speak word', 'Read the vocabulary word.') +
      checkboxRow('speakMeaning', 'Speak meaning', 'Read the meaning or translation.') +
      checkboxRow('speakExample', 'Speak example', 'Read the example sentence when available.') +
      '<div class="auto-run-row"><div><div class="auto-run-title">Pause between items</div><div class="auto-run-desc">Silence after each spoken item.</div></div><select data-auto-run="pauseMs"><option value="0">None</option><option value="300">0.3 sec</option><option value="500">0.5 sec</option><option value="1000">1 sec</option><option value="1500">1.5 sec</option></select></div>' +
      '<div class="auto-run-row"><div><div class="auto-run-title">Time before next card</div><div class="auto-run-desc">Silence after the final spoken item.</div></div><select data-auto-run="advanceMs"><option value="800">0.8 sec</option><option value="1200">1.2 sec</option><option value="1800">1.8 sec</option><option value="3000">3 sec</option><option value="5000">5 sec</option><option value="8000">8 sec</option></select></div>' +
      checkboxRow('loop', 'Loop session', 'Restart from the first word after the final card.');

    const cloud = document.getElementById('cloudSyncPanel');
    if (cloud) account.insertBefore(panel, cloud);
    else account.appendChild(panel);

    const config = settings();
    panel.querySelectorAll('[data-auto-run]').forEach(input => {
      const key = input.dataset.autoRun;
      if (input.type === 'checkbox') input.checked = Boolean(config[key]);
      else input.value = String(config[key]);
      input.addEventListener('change', () => {
        config[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
        saveSettings();
      });
    });
  }

  window.toggleStudyAutoRun = function toggleStudyAutoRun() {
    setActive(!active);
  };

  const originalRenderLearn = window.renderLearn;
  window.renderLearn = function renderLearnWithAutoRun() {
    originalRenderLearn?.apply(this, arguments);
    ensureStudyControl();

    if (!Array.isArray(lList) || lI >= lList.length) {
      if (active && settings().loop && lList.length) {
        lI = 0;
        originalRenderLearn?.apply(this, arguments);
        ensureStudyControl();
        runCurrentCard();
      } else {
        setActive(false);
      }
      return;
    }

    refreshControl();
    if (active) {
      setTimeout(runCurrentCard, 0);
    }
  };

  const originalStart = window.startRecitingSelectedWords;
  window.startRecitingSelectedWords = function startRecitingWithAutoRun() {
    originalStart?.apply(this, arguments);
    if (settings().autoStart && Array.isArray(lList) && lList.length) setActive(true);
  };

  const previousUpdateAccount = window.updateAccount;
  window.updateAccount = function updateAccountWithAutoRunSettings() {
    previousUpdateAccount?.apply(this, arguments);
    ensureSettingsPanel();
  };

  document.addEventListener('click', () => setTimeout(ensureSettingsPanel, 0), true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') window.speechSynthesis?.cancel();
  });
  window.addEventListener('pagehide', () => clearRun());
  setTimeout(ensureSettingsPanel, 0);
})();