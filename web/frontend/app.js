// SiteToPdf Web Frontend — app.js
// Replaces Electron IPC bridge with HTTP API + Server-Sent Events

// ── LocalStorage Keys ──
const LS_API_KEY = 'sitetopdf_gemini_api_key';
const LS_MODEL = 'sitetopdf_gemini_model';

// ── State ──
let currentMode = 'single';
let isConverting = false;
let activeEventSource = null;
let mergeFiles = []; // { file: File, name: string }

// ── Elements ──
const form = document.getElementById('convertForm');
const modeButtons = document.querySelectorAll('.mode-btn');
const singleUrlSection = document.getElementById('singleUrlSection');
const urlListSection = document.getElementById('urlListSection');
const crawlOptionsSection = document.getElementById('crawlOptionsSection');
const urlInput = document.getElementById('urlInput');
const urlListInput = document.getElementById('urlListInput');
const formatSelect = document.getElementById('formatSelect');
const compressToggle = document.getElementById('compressToggle');
const summaryLangGroup = document.getElementById('summaryLangGroup');
const summaryLangSelect = document.getElementById('summaryLangSelect');
const summaryModelGroup = document.getElementById('summaryModelGroup');
const summaryModelSelect = document.getElementById('summaryModelSelect');
const maxDepth = document.getElementById('maxDepth');
const maxPages = document.getElementById('maxPages');
const crawlDelay = document.getElementById('crawlDelay');
const convertBtn = document.getElementById('convertBtn');
const btnText = convertBtn.querySelector('.btn-text');
const btnSpinner = convertBtn.querySelector('.btn-spinner');
const progressLog = document.getElementById('progressLog');
const clearLogBtn = document.getElementById('clearLogBtn');
const resultCard = document.getElementById('resultCard');
const resultContent = document.getElementById('resultContent');
const summaryCard = document.getElementById('summaryCard');
const summaryTitle = document.getElementById('summaryTitle');
const summaryBody = document.getElementById('summaryBody');
const closeSummaryBtn = document.getElementById('closeSummaryBtn');
const mergeSection = document.getElementById('mergeSection');
const addPdfFilesBtn = document.getElementById('addPdfFilesBtn');
const mergeFileList = document.getElementById('mergeFileList');
const pdfFileInput = document.getElementById('pdfFileInput');
const optionsSection = document.getElementById('optionsSection');
const formatGroup = document.getElementById('formatGroup');
const compressGroup = document.getElementById('compressGroup');

// Settings elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const clearApiKeyBtn = document.getElementById('clearApiKeyBtn');
const keyStatus = document.getElementById('keyStatus');
const keyStatusText = document.getElementById('keyStatusText');
const geminiModelSelect = document.getElementById('geminiModelSelect');

// ── Mode Switching ──
modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    updateVisibleSections();
  });
});

function updateVisibleSections() {
  singleUrlSection.classList.add('hidden');
  urlListSection.classList.add('hidden');
  crawlOptionsSection.classList.add('hidden');
  summaryLangGroup.classList.add('hidden');
  summaryModelGroup.classList.add('hidden');
  mergeSection.classList.add('hidden');
  formatGroup.classList.remove('hidden');
  compressGroup.classList.remove('hidden');
  urlInput.required = false;
  urlListInput.required = false;

  if (currentMode === 'single') {
    singleUrlSection.classList.remove('hidden');
    urlInput.required = true;
    btnText.textContent = 'Convert to PDF';
  } else if (currentMode === 'crawl') {
    singleUrlSection.classList.remove('hidden');
    crawlOptionsSection.classList.remove('hidden');
    urlInput.required = true;
    btnText.textContent = 'Convert to PDF';
  } else if (currentMode === 'list') {
    urlListSection.classList.remove('hidden');
    urlListInput.required = true;
    btnText.textContent = 'Convert to PDF';
  } else if (currentMode === 'summarize') {
    singleUrlSection.classList.remove('hidden');
    summaryLangGroup.classList.remove('hidden');
    summaryModelGroup.classList.remove('hidden');
    urlInput.required = true;
    btnText.textContent = 'Summarize';
  } else if (currentMode === 'merge') {
    mergeSection.classList.remove('hidden');
    formatGroup.classList.add('hidden');
    compressGroup.classList.add('hidden');
    btnText.textContent = 'Merge PDFs';
  }
}

// ── Clear Log ──
clearLogBtn.addEventListener('click', () => {
  progressLog.innerHTML = '<div class="log-entry log-info">Ready to convert...</div>';
  resultCard.classList.add('hidden');
  summaryCard.classList.add('hidden');
});

// Close summary card
closeSummaryBtn.addEventListener('click', () => {
  summaryCard.classList.add('hidden');
});

// ── Merge PDFs (web: file input) ──
addPdfFilesBtn.addEventListener('click', () => {
  pdfFileInput.click();
});

pdfFileInput.addEventListener('change', () => {
  const files = Array.from(pdfFileInput.files);
  files.forEach(file => {
    // Deduplicate by name + size
    const isDup = mergeFiles.some(f => f.name === file.name && f.file.size === file.size);
    if (!isDup) {
      mergeFiles.push({ file, name: file.name });
    }
  });
  pdfFileInput.value = '';
  renderMergeFileList();
});

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderMergeFileList() {
  if (mergeFiles.length === 0) {
    mergeFileList.innerHTML = '<div class="merge-empty-state">No PDF files selected. Click "Add PDF Files" to begin.</div>';
    return;
  }
  mergeFileList.innerHTML = mergeFiles.map((entry, index) => {
    return `
      <div class="merge-file-item" data-index="${index}">
        <span class="merge-file-number">${index + 1}.</span>
        <span class="merge-file-name" title="${entry.name}">${entry.name}</span>
        <span class="merge-file-size">${formatFileSize(entry.file.size)}</span>
        <div class="merge-file-actions">
          <button type="button" class="merge-btn-move" data-action="up" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Move up">▲</button>
          <button type="button" class="merge-btn-move" data-action="down" data-index="${index}" ${index === mergeFiles.length - 1 ? 'disabled' : ''} title="Move down">▼</button>
          <button type="button" class="merge-btn-remove" data-index="${index}" title="Remove">✕</button>
        </div>
      </div>
    `;
  }).join('');

  mergeFileList.querySelectorAll('.merge-btn-move').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.index);
      const action = btn.dataset.action;
      if (action === 'up' && i > 0) {
        [mergeFiles[i - 1], mergeFiles[i]] = [mergeFiles[i], mergeFiles[i - 1]];
        renderMergeFileList();
      } else if (action === 'down' && i < mergeFiles.length - 1) {
        [mergeFiles[i], mergeFiles[i + 1]] = [mergeFiles[i + 1], mergeFiles[i]];
        renderMergeFileList();
      }
    });
  });

  mergeFileList.querySelectorAll('.merge-btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.index);
      mergeFiles.splice(i, 1);
      renderMergeFileList();
    });
  });
}

// ── Progress Logging ──
function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 chord
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.1 + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.1 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.5);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

function addLogEntry(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

function classifyLogMessage(message) {
  if (message.includes('✅') || message.toLowerCase().includes('success')) return 'success';
  if (message.includes('⚠') || message.toLowerCase().includes('warn')) return 'warning';
  if (message.includes('❌') || message.toLowerCase().includes('error')) return 'error';
  return 'info';
}

// ── SSE Helper ──
function connectJobSSE(jobId) {
  return new Promise((resolve, reject) => {
    if (activeEventSource) {
      activeEventSource.close();
    }

    const es = new EventSource(`/api/jobs/${jobId}/status`);
    activeEventSource = es;

    es.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        const msg = data.message || data.msg || e.data;
        addLogEntry(msg, classifyLogMessage(msg));
      } catch {
        addLogEntry(e.data, classifyLogMessage(e.data));
      }
    });

    es.addEventListener('complete', (e) => {
      es.close();
      activeEventSource = null;
      try {
        const data = JSON.parse(e.data);
        resolve(data);
      } catch {
        resolve({ jobId });
      }
    });

    es.addEventListener('error', (e) => {
      // SSE error event can mean either a server-sent error or connection loss
      if (e.data) {
        es.close();
        activeEventSource = null;
        try {
          const data = JSON.parse(e.data);
          reject(new Error(data.message || data.error || 'Job failed'));
        } catch {
          reject(new Error(e.data));
        }
      } else {
        // Connection error — SSE will auto-reconnect for non-closed connections,
        // but if we already closed it, this is a genuine failure
        es.close();
        activeEventSource = null;
        reject(new Error('Connection to server lost'));
      }
    });
  });
}

// ── API Helpers ──
async function postJSON(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || err.message || `HTTP ${resp.status}`);
  }
  return resp.json();
}

// ── Form Submission ──
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isConverting) return;

  resultCard.classList.add('hidden');
  summaryCard.classList.add('hidden');

  if (currentMode === 'summarize') {
    await handleSummarize();
    return;
  }
  if (currentMode === 'merge') {
    await handleMerge();
    return;
  }

  setConverting(true);
  addLogEntry('Starting conversion...', 'info');
  document.getElementById('progressCard').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const commonOptions = {
      format: formatSelect.value,
      compress: compressToggle.checked,
    };

    let endpoint;
    let body;

    if (currentMode === 'single') {
      endpoint = '/api/convert/single';
      body = { url: urlInput.value, ...commonOptions };
    } else if (currentMode === 'crawl') {
      endpoint = '/api/convert/crawl';
      body = {
        startUrl: urlInput.value,
        maxDepth: parseInt(maxDepth.value),
        maxPages: parseInt(maxPages.value),
        delay: parseInt(crawlDelay.value),
        ...commonOptions,
      };
    } else if (currentMode === 'list') {
      const urls = urlListInput.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (urls.length === 0) {
        addLogEntry('Please enter at least one URL', 'error');
        setConverting(false);
        return;
      }

      endpoint = '/api/convert/list';
      body = { urls, ...commonOptions };
    }

    // Step 1: POST to API → get jobId
    const { jobId } = await postJSON(endpoint, body);
    addLogEntry(`Job started: ${jobId}`, 'info');

    // Step 2: Connect SSE for progress
    const result = await connectJobSSE(jobId);

    // Step 3: Show result
    addLogEntry('✅ PDF generated successfully', 'success');
    showResult(true, jobId);
    playSuccessSound();
  } catch (error) {
    addLogEntry(`Error: ${error.message}`, 'error');
    showResult(false, error.message);
  } finally {
    setConverting(false);
  }
});

// ── Merge Handler ──
// TODO: The /api/merge endpoint is Phase 2 — Simba will implement it.
// This frontend code is ready and will work once the endpoint exists.
async function handleMerge() {
  if (mergeFiles.length < 2) {
    addLogEntry('Please select at least 2 PDF files to merge', 'error');
    return;
  }

  setConverting(true);
  addLogEntry(`Merging ${mergeFiles.length} PDF files...`, 'info');
  document.getElementById('progressCard').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    // Read all files as base64
    const filesData = await Promise.all(
      mergeFiles.map(entry => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1]; // strip data:...;base64, prefix
            resolve({ name: entry.name, data: base64 });
          };
          reader.onerror = () => reject(new Error(`Failed to read ${entry.name}`));
          reader.readAsDataURL(entry.file);
        });
      })
    );

    const { jobId } = await postJSON('/api/merge', { files: filesData });
    addLogEntry(`Merge job started: ${jobId}`, 'info');

    const result = await connectJobSSE(jobId);

    addLogEntry('✅ PDFs merged successfully', 'success');
    showResult(true, jobId);
    playSuccessSound();
  } catch (error) {
    addLogEntry(`Error: ${error.message}`, 'error');
    showResult(false, error.message);
  } finally {
    setConverting(false);
  }
}

// ── Summarize Handler ──
async function handleSummarize() {
  const url = urlInput.value.trim();
  if (!url) {
    addLogEntry('Please enter a URL to summarize', 'error');
    return;
  }

  const apiKey = localStorage.getItem(LS_API_KEY);
  if (!apiKey) {
    addLogEntry('No Gemini API key configured. Please open Settings to add your key.', 'error');
    showResult(false, 'No API key set. Click the ⚙ gear icon in the header to configure your Gemini API key.');
    return;
  }

  setConverting(true);
  addLogEntry('Starting summarization...', 'info');
  document.getElementById('progressCard').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const language = summaryLangSelect.value;
    const model = summaryModelSelect.value;

    const { jobId } = await postJSON('/api/summarize', {
      url,
      language,
      model,
      apiKey,
    });
    addLogEntry(`Summarize job started: ${jobId}`, 'info');

    const result = await connectJobSSE(jobId);

    if (result.title || result.summary) {
      showSummary(result.title, result.summary);
    }
    if (result.jobId || jobId) {
      showResult(true, result.jobId || jobId);
    }
    playSuccessSound();
  } catch (error) {
    if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
      const cleanMsg = error.message.replace('QUOTA_EXCEEDED: ', '');
      addLogEntry('Gemini API quota exceeded', 'error');
      showResult(false, '⚠️ ' + cleanMsg);
    } else {
      addLogEntry(`Error: ${error.message}`, 'error');
      showResult(false, error.message);
    }
  } finally {
    setConverting(false);
  }
}

// ── UI Helpers ──
function showSummary(title, summaryText) {
  summaryCard.classList.remove('hidden');
  summaryTitle.textContent = title || 'Summary';
  const formatted = summaryText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  summaryBody.innerHTML = `<p>${formatted}</p>`;
}

function setConverting(converting) {
  isConverting = converting;
  convertBtn.disabled = converting;

  if (converting) {
    if (currentMode === 'summarize') {
      btnText.textContent = 'Summarizing...';
    } else if (currentMode === 'merge') {
      btnText.textContent = 'Merging...';
    } else {
      btnText.textContent = 'Converting...';
    }
    btnSpinner.classList.remove('hidden');
  } else {
    if (currentMode === 'summarize') {
      btnText.textContent = 'Summarize';
    } else if (currentMode === 'merge') {
      btnText.textContent = 'Merge PDFs';
    } else {
      btnText.textContent = 'Convert to PDF';
    }
    btnSpinner.classList.add('hidden');
  }
}

function showResult(success, data) {
  resultCard.classList.remove('hidden');

  if (success) {
    // data is the jobId — provide a download link
    const downloadUrl = `/api/jobs/${data}/download`;
    resultContent.innerHTML = `
      <div class="result-success">
        <div class="result-message success">
          <span>✅</span>
          <span>PDF generated successfully</span>
        </div>
        <div class="result-actions">
          <a href="${downloadUrl}" class="btn-download" download>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download PDF
          </a>
        </div>
      </div>
    `;
  } else {
    resultContent.innerHTML = `
      <div class="result-message error">
        <span>❌</span>
        <span>Error: ${data}</span>
      </div>
    `;
  }
}

// ── Settings Modal ──
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
  loadApiKeyStatus();
  loadModelSetting();
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  apiKeyInput.value = '';
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.add('hidden');
    apiKeyInput.value = '';
  }
});

function maskKey(key) {
  if (!key || key.length < 8) return key ? '••••' : '';
  return key.substring(0, 4) + '••••' + key.substring(key.length - 4);
}

function loadApiKeyStatus() {
  const key = localStorage.getItem(LS_API_KEY);
  if (key) {
    keyStatusText.textContent = `Current key: ${maskKey(key)}`;
    keyStatus.classList.add('has-key');
    clearApiKeyBtn.classList.remove('hidden');
  } else {
    keyStatusText.textContent = 'No API key set';
    keyStatus.classList.remove('has-key');
    clearApiKeyBtn.classList.add('hidden');
  }
}

saveApiKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;

  localStorage.setItem(LS_API_KEY, key);
  apiKeyInput.value = '';
  keyStatusText.textContent = `Current key: ${maskKey(key)}`;
  keyStatus.classList.add('has-key');
  clearApiKeyBtn.classList.remove('hidden');
  addLogEntry('API key saved successfully', 'success');
});

clearApiKeyBtn.addEventListener('click', () => {
  localStorage.removeItem(LS_API_KEY);
  keyStatusText.textContent = 'No API key set';
  keyStatus.classList.remove('has-key');
  clearApiKeyBtn.classList.add('hidden');
  addLogEntry('API key cleared', 'info');
});

function loadModelSetting() {
  const model = localStorage.getItem(LS_MODEL);
  if (model) {
    geminiModelSelect.value = model;
    summaryModelSelect.value = model;
  }
}

geminiModelSelect.addEventListener('change', () => {
  localStorage.setItem(LS_MODEL, geminiModelSelect.value);
  summaryModelSelect.value = geminiModelSelect.value;
  addLogEntry(`Gemini model set to ${geminiModelSelect.value}`, 'info');
});

summaryModelSelect.addEventListener('change', () => {
  localStorage.setItem(LS_MODEL, summaryModelSelect.value);
  geminiModelSelect.value = summaryModelSelect.value;
});

// ── Init ──
loadModelSetting();
