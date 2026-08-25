// WordJar Gemini Model Fix V4
// Uses Gemini Flash first. Smart Fill fills only empty text fields, adds synonyms, and selects type reliably.

(function installWordJarGeminiModelFix() {
  if (window.__wordjarGeminiModelFixInstalledV4) return;
  window.__wordjarGeminiModelFixInstalledV4 = true;

  const API_VERSION = 'v1beta';
  const STYLE_ID = 'wordjarGeminiSmartFillPolishStyle';
  const MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest'
  ];

  const ANALYSIS_MAX_TOKENS = 1400;
  const SMART_FILL_MAX_TOKENS = 1000;
  let lastGeminiError = null;

  function safeText(value) {
    if (typeof escapeHTML === 'function') return escapeHTML(value);
    if (typeof escHTML === 'function') return escHTML(value);
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeToast(message) {
    if (typeof toast === 'function') toast(message);
  }

  function setStatus(message, state) {
    if (typeof setAutoFillStatus === 'function') {
      setAutoFillStatus(message, state);
      return;
    }
    safeToast(message);
  }

  function injectSmartFillPolishStyles() {
    document.getElementById(STYLE_ID)?.remove();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #wordModal .wordjar-smart-fill-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 10px;
        width: 100%;
        margin: 12px 0 8px;
        align-items: stretch;
      }

      #wordModal .wordjar-smart-fill-row > div { min-width: 0; }

      #wordModal .wordjar-smart-fill-btn,
      #wordModal #wordjarSmartFillBtn {
        width: 100%;
        min-width: 0;
        min-height: 48px;
        border-radius: 18px;
        border: 1px solid var(--bdr);
        font: inherit;
        font-size: 14px;
        font-weight: 900;
        line-height: 1.08;
        letter-spacing: -0.02em;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 0 12px;
        cursor: pointer;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.04);
      }

      #wordModal .wordjar-smart-fill-btn.secondary {
        background: var(--sur);
        color: var(--ink);
      }

      #wordModal #wordjarSmartFillBtn {
        background: var(--ink);
        color: var(--sur);
        border-color: var(--ink);
      }

      #wordModal .wordjar-smart-fill-btn:disabled,
      #wordModal #wordjarSmartFillBtn:disabled {
        opacity: .58;
        cursor: not-allowed;
      }

      #wordModal #autoFillStatus {
        margin-top: 8px;
        grid-column: 1 / -1;
      }

      @media (max-width: 380px) {
        #wordModal .wordjar-smart-fill-row { gap: 8px; }
        #wordModal .wordjar-smart-fill-btn,
        #wordModal #wordjarSmartFillBtn {
          min-height: 46px;
          border-radius: 16px;
          font-size: 13px;
          padding: 0 8px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  async function ensureApiKey() {
    if (typeof window.initAppConfig === 'function') await window.initAppConfig();
    const key = String(window.globalApiKey || window.getApiKeyFromMemory?.() || '').trim();
    if (!key) throw new Error('NO_API_KEY');
    return key;
  }

  function extractJSON(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('EMPTY_AI_RESPONSE');
    try { return JSON.parse(raw); } catch (err) {}
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('INVALID_AI_JSON');
  }

  function shouldFallback(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.status === 400 || error?.status === 404 || message.includes('not found') || message.includes('unsupported') || message.includes('responsemimetype') || message.includes('model');
  }

  function buildBody(prompt, maxTokens, forceJson) {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.85,
        maxOutputTokens: maxTokens
      }
    };
    if (forceJson) body.generationConfig.responseMimeType = 'application/json';
    return body;
  }

  async function callModel(apiKey, model, prompt, maxTokens, forceJson) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/${API_VERSION}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(buildBody(prompt, maxTokens, forceJson))
      });

      const raw = await response.text();
      let payload = null;
      try { payload = JSON.parse(raw); } catch (err) {}

      if (!response.ok) {
        const apiMessage = payload?.error?.message || raw || `HTTP ${response.status}`;
        const error = new Error(`AI_${response.status}: ${apiMessage}`);
        error.status = response.status;
        error.model = model;
        error.apiMessage = apiMessage;
        throw error;
      }

      const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
      if (!text.trim()) throw new Error(`EMPTY_AI_RESPONSE from ${model}`);

      window.WordJarAIConfig = window.WordJarAIConfig || {};
      window.WordJarAIConfig.lastModel = model;
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  async function callServerModel(model, prompt, maxTokens, forceJson) {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        apiVersion: API_VERSION,
        payload: buildBody(prompt, maxTokens, forceJson)
      })
    });

    const raw = await response.text();
    let payload = null;
    try { payload = JSON.parse(raw); } catch (err) {}

    if (!response.ok) {
      const apiMessage = payload?.error?.message || raw || `HTTP ${response.status}`;
      const error = new Error(`AI_${response.status}: ${apiMessage}`);
      error.status = response.status;
      error.model = model;
      error.apiMessage = apiMessage;
      throw error;
    }

    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
    if (!text.trim()) throw new Error(`EMPTY_AI_RESPONSE from ${model}`);

    window.WordJarAIConfig = window.WordJarAIConfig || {};
    window.WordJarAIConfig.lastModel = model;
    return text;
  }

  async function callGemini(prompt, options = {}) {
    let apiKey = '';
    try { apiKey = await ensureApiKey(); } catch (e) {}

    const models = options.models || MODELS;
    const maxTokens = options.maxTokens || 900;
    let lastError = null;

    for (const model of models) {
      try {
        if (apiKey) {
          return await callModel(apiKey, model, prompt, maxTokens, options.forceJson !== false);
        } else {
          return await callServerModel(model, prompt, maxTokens, options.forceJson !== false);
        }
      } catch (err) {
        lastError = err;
        lastGeminiError = err;
        console.warn(`Gemini call failed with ${model}`, err);

        if (options.forceJson !== false && shouldFallback(err)) {
          try {
            if (apiKey) {
              return await callModel(apiKey, model, prompt, maxTokens, false);
            } else {
              return await callServerModel(model, prompt, maxTokens, false);
            }
          } catch (retryErr) {
            lastError = retryErr;
            lastGeminiError = retryErr;
            console.warn(`Gemini retry failed with ${model}`, retryErr);
          }
        }

        if (!shouldFallback(lastError)) break;
      }
    }

    throw lastError || new Error('AI_CALL_FAILED');
  }

  function userFacingError(error) {
    const message = String(error?.message || '');
    const apiMessage = String(error?.apiMessage || '');
    if (message.includes('NO_API_KEY')) return 'No API key found. Add your Private API Key in Settings.';
    if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) return 'The API key is invalid. Check your Private API Key.';
    if (message.includes('403') || message.includes('PERMISSION_DENIED')) return 'This API key does not have Gemini API access, has a referrer restriction, or needs billing enabled.';
    if (message.includes('429')) return 'Gemini quota or rate limit reached. Try again later.';
    if (message.includes('404') || apiMessage.includes('not found')) return 'The Flash model is not available for this key. Check your Gemini API key or API restrictions.';
    if (message.includes('Failed to fetch')) return 'Could not reach Gemini. Check your network connection or API key restrictions.';
    return `AI failed: ${apiMessage || message || 'unknown error'}`;
  }

  function getUserLevel() {
    return String(D?.profile?.userLevel || D?.profile?.englishLevel || D?.profile?.cefrLevel || D?.reader?.userLevel || 'A2').trim().toUpperCase() || 'A2';
  }

  function buildAnalysisPrompt(text, userLevel) {
    return `You are an expert English-to-Thai literary translator and English learning tutor.\n\nTask: Smart_Translation_and_Analysis\nUser level: ${userLevel}\nText: ${text}\n\nReturn ONLY valid JSON. No markdown.\nSchema:\n{\n  "translation": "Contextual Thai translation that is polished and natural for a story",\n  "grammar_explanation": "Explain difficult grammar simply for ${userLevel} learner in Thai",\n  "vocabulary_focus": [\n    {\n      "word": "important word or phrase",\n      "meaning": "Thai meaning in this context",\n      "why_important": "why this item matters for this level"\n    }\n  ]\n}\n\nRequirements:\n- Translate by context, not word-by-word.\n- Explain story nuance clearly.\n- Keep explanations simple enough for ${userLevel}.\n- Choose 2-5 useful vocabulary items.`;
  }

  function normalizeAnalysis(data) {
    const item = data || {};
    const vocab = Array.isArray(item.vocabulary_focus) ? item.vocabulary_focus : [];
    return {
      translation: String(item.translation || '').trim(),
      grammar_explanation: String(item.grammar_explanation || item.explanation || '').trim(),
      vocabulary_focus: vocab.map(v => ({
        word: String(v?.word || '').trim(),
        meaning: String(v?.meaning || '').trim(),
        why_important: String(v?.why_important || v?.note || '').trim()
      })).filter(v => v.word || v.meaning || v.why_important).slice(0, 5)
    };
  }

  async function smartTranslateAndAnalyze(text, userLevel = getUserLevel()) {
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) throw new Error('EMPTY_TEXT');
    const output = await callGemini(buildAnalysisPrompt(cleanText, userLevel), { maxTokens: ANALYSIS_MAX_TOKENS, forceJson: true });
    return normalizeAnalysis(extractJSON(output));
  }

  function analysisHTML(result, userLevel = getUserLevel()) {
    const vocab = Array.isArray(result?.vocabulary_focus) ? result.vocabulary_focus : [];
    return `
      <div class="wordjar-reader-ai-card">
        <div class="wordjar-reader-ai-title">Smart Analysis · ${safeText(userLevel)} · ${safeText(window.WordJarAIConfig?.lastModel || 'Gemini Flash')}</div>
        <div class="wordjar-reader-ai-section"><div class="wordjar-reader-ai-label">Translation</div><div class="wordjar-reader-ai-text">${safeText(result?.translation || 'No translation returned.')}</div></div>
        <div class="wordjar-reader-ai-section"><div class="wordjar-reader-ai-label">Grammar</div><div class="wordjar-reader-ai-text">${safeText(result?.grammar_explanation || 'No grammar explanation returned.')}</div></div>
        <div class="wordjar-reader-ai-section"><div class="wordjar-reader-ai-label">Vocabulary Focus</div><div class="wordjar-reader-ai-list">
          ${vocab.length ? vocab.map(item => `<div class="wordjar-reader-ai-vocab"><b>${safeText(item.word)}</b><span>${safeText(item.meaning)}</span><span>${safeText(item.why_important)}</span></div>`).join('') : '<div class="wordjar-reader-ai-text">No vocabulary focus returned.</div>'}
        </div></div>
      </div>
    `;
  }

  async function runReaderSmartAnalysis() {
    const slot = document.getElementById('wordjarReaderAIAnalysisSlot');
    const btn = document.getElementById('wordjarReaderAIAnalyzeBtn');
    const text = document.querySelector('#readerPanel .reader-context')?.textContent || '';
    if (!String(text || '').trim()) {
      safeToast('No sentence to analyze');
      return;
    }

    const oldText = btn?.textContent || 'Smart Analysis';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Flash analyzing...';
    }
    if (slot) slot.innerHTML = `<div class="wordjar-reader-ai-card"><div class="wordjar-reader-ai-title">Smart Analysis</div><div class="wordjar-reader-ai-text">Gemini Flash is analyzing the story context...</div></div>`;

    try {
      const result = await smartTranslateAndAnalyze(text, getUserLevel());
      if (slot) slot.innerHTML = analysisHTML(result, getUserLevel());
      safeToast('Analysis ready');
    } catch (err) {
      lastGeminiError = err;
      console.warn('Reader Smart Analysis failed', err);
      const message = userFacingError(err);
      if (slot) slot.innerHTML = `<div class="wordjar-reader-ai-card"><div class="wordjar-reader-ai-title">Smart Analysis</div><div class="wordjar-reader-ai-error">${safeText(message)}</div></div>`;
      safeToast(message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    }
  }

  function buildSmartFillPrompt(word) {
    const level = getUserLevel();
    const mode = D?.reader?.mode || 'en-th';
    const targetMeaning = mode === 'en-th' ? 'Thai meaning for an English learner' : 'clear English learner definition';
    return `You are a high-accuracy vocabulary analyst for Thai learners.\n\nTask: Smart Fill vocabulary card.\nLearner level: ${level}\nWord or phrase: ${word}\n\nReturn ONLY valid JSON. No markdown.\nSchema:\n{\n  "word": "base word or phrase",\n  "type": "N | V | ADJ | ADV | ART | PRON | PHR | IDM",\n  "pronunciation": "/Precise IPA, General British if applicable/",\n  "meaning": "${targetMeaning}, context-aware when possible",\n  "synonyms": ["2-5 useful English synonyms or near-synonyms"],\n  "example": "short natural ${level}-level example sentence using the word",\n  "notes": "short helpful Thai note, include nuance or common usage"\n}\n\nRules:\n- synonyms must be English words or phrases only.\n- Keep Thai fields natural and concise.\n- Use type PHR for phrases and IDM for idioms.`;
  }

  function normalizeSynonyms(value) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean).slice(0, 5);
    return String(value || '').split(/[,;|]/).map(v => v.trim()).filter(Boolean).slice(0, 5);
  }

  function normalizeSmartFillResult(data) {
    const item = data || {};
    const type = String(item.type || 'N').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) || 'N';
    return {
      word: String(item.word || '').trim(),
      type: ['N', 'V', 'ADJ', 'ADV', 'ART', 'PRON', 'PHR', 'IDM'].includes(type) ? type : 'N',
      pronunciation: String(item.pronunciation || '').trim(),
      meaning: String(item.meaning || '').trim(),
      synonyms: normalizeSynonyms(item.synonyms || item.synonym || ''),
      example: String(item.example || '').trim(),
      notes: String(item.notes || '').trim()
    };
  }

  async function fetchGeminiSmartFill(word) {
    const output = await callGemini(buildSmartFillPrompt(word), { maxTokens: SMART_FILL_MAX_TOKENS, forceJson: true });
    return normalizeSmartFillResult(extractJSON(output));
  }

  function fillIfEmpty(id, value) {
    const el = document.getElementById(id);
    const clean = Array.isArray(value) ? value.join(', ') : String(value || '').trim();
    if (!el || !clean || el.value.trim()) return false;
    el.value = clean;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function hasUserSelectedType() {
    try {
      const selected = Array.from(document.querySelectorAll('#typePills .tp.sel')).map(btn => String(btn.dataset.t || '').toUpperCase());
      if (!selected.length) return false;
      const wordId = typeof editWordId !== 'undefined' ? editWordId : null;
      const existing = wordId ? D.words.find(w => String(w.id) === String(wordId)) : null;
      if (!existing || !String(existing.type || '').trim()) return false;
      const existingTypes = String(existing.type || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
      return existingTypes.length && selected.every(t => existingTypes.includes(t));
    } catch (err) {
      return false;
    }
  }

  function selectSmartType(type) {
    const safeType = String(type || 'N').toUpperCase();
    if (typeof selectOnlyType === 'function') selectOnlyType(safeType);
    else {
      try { selectedTypes?.clear?.(); } catch (err) {}
      document.querySelectorAll('#typePills .tp').forEach(btn => btn.classList.remove('sel'));
      const target = document.querySelector(`#typePills .tp[data-t="${safeType}"]`) || document.querySelector('#typePills .tp[data-t="N"]');
      if (target) {
        target.classList.add('sel');
        try { selectedTypes?.add?.(target.dataset.t); } catch (err) {}
      }
    }
    return true;
  }

  async function smartFillWord() {
    injectSmartFillPolishStyles();
    const word = String(document.getElementById('fWord')?.value || '').trim();
    if (!word) {
      setStatus('Type a word first.', 'err');
      safeToast('Type a word first');
      return;
    }

    const btn = document.getElementById('wordjarSmartFillBtn');
    const oldText = btn?.textContent || 'Smart Fill';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Flash...';
    }
    setStatus('Smart Fill Flash is thinking...', 'loading');

    try {
      const result = await fetchGeminiSmartFill(word);
      let count = 0;
      if (fillIfEmpty('fPron', result.pronunciation)) count++;
      if (fillIfEmpty('fMeaning', result.meaning)) count++;
      if (fillIfEmpty('fSynonyms', result.synonyms)) count++;
      if (fillIfEmpty('fEx', result.example)) count++;
      if (fillIfEmpty('fNotes', result.notes)) count++;
      if (!hasUserSelectedType() && selectSmartType(result.type)) count++;

      setStatus(count ? `Smart Fill completed with ${window.WordJarAIConfig?.lastModel || 'Gemini Flash'}. Filled empty fields only.` : 'Nothing changed because all fields already have content.', 'ok');
      safeToast(count ? 'Smart-filled empty fields' : 'Already filled');
    } catch (err) {
      lastGeminiError = err;
      console.warn('Smart Fill failed', err);
      const message = userFacingError(err);
      setStatus(message, 'err');
      safeToast(message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    }
  }

  function bindButtons() {
    injectSmartFillPolishStyles();
    const readerBtn = document.getElementById('wordjarReaderAIAnalyzeBtn');
    if (readerBtn && readerBtn.onclick !== runReaderSmartAnalysis) readerBtn.onclick = runReaderSmartAnalysis;
    const wordBtn = document.getElementById('wordjarSmartFillBtn');
    if (wordBtn && wordBtn.onclick !== smartFillWord) wordBtn.onclick = smartFillWord;
  }

  function boot() {
    injectSmartFillPolishStyles();
    window.WordJarAIConfig = {
      apiVersion: API_VERSION,
      primaryModel: MODELS[0],
      modelFallbacks: MODELS.slice(1),
      lastModel: window.WordJarAIConfig?.lastModel || '',
      callGemini,
      lastError: () => lastGeminiError
    };
    window.smartTranslateAndAnalyze = smartTranslateAndAnalyze;
    window.runReaderSmartAnalysis = runReaderSmartAnalysis;
    window.smartFillWord = smartFillWord;
    window.WordJarHighEndAI = window.WordJarHighEndAI || {};
    window.WordJarHighEndAI.runReaderSmartAnalysis = runReaderSmartAnalysis;
    window.WordJarHighEndAI.smartTranslateAndAnalyze = smartTranslateAndAnalyze;
    window.WordJarHighEndAI.smartFillWord = smartFillWord;
    window.WordJarHighEndAI.fetchHighEndSmartFill = fetchGeminiSmartFill;
    bindButtons();
  }

  boot();
  setTimeout(boot, 0);
  setTimeout(boot, 400);
  document.addEventListener('click', () => setTimeout(bindButtons, 0), true);
})();
