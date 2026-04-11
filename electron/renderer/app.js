// State
let currentMode = 'single';
let isConverting = false;
let defaultOutputDir = '';

// Elements
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
const outputPath = document.getElementById('outputPath');
const browseBtn = document.getElementById('browseBtn');
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
const updateBar = document.getElementById('updateBar');
const updateMessage = document.getElementById('updateMessage');
const updateAction = document.getElementById('updateAction');
const updateDismiss = document.getElementById('updateDismiss');
const summaryCard = document.getElementById('summaryCard');
const summaryTitle = document.getElementById('summaryTitle');
const summaryBody = document.getElementById('summaryBody');
const closeSummaryBtn = document.getElementById('closeSummaryBtn');

// Settings elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const clearApiKeyBtn = document.getElementById('clearApiKeyBtn');
const keyStatus = document.getElementById('keyStatus');
const keyStatusText = document.getElementById('keyStatusText');

// Mode switching
modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    
    // Update active button
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update visible sections
    currentMode = mode;
    updateVisibleSections();
  });
});

function updateVisibleSections() {
  // Reset visibility
  singleUrlSection.classList.add('hidden');
  urlListSection.classList.add('hidden');
  crawlOptionsSection.classList.add('hidden');
  summaryLangGroup.classList.add('hidden');
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
    urlInput.required = true;
    btnText.textContent = 'Summarize';
  }
}

// Browse button
browseBtn.addEventListener('click', async () => {
  const defaultFilename = outputPath.value || 'output.pdf';
  const filePath = await window.siteToPdf.chooseSavePath(defaultFilename);
  if (filePath) {
    outputPath.value = filePath;
  }
});

// Clear log button
clearLogBtn.addEventListener('click', () => {
  progressLog.innerHTML = '<div class="log-entry log-info">Ready to convert...</div>';
});

// Close summary card
closeSummaryBtn.addEventListener('click', () => {
  summaryCard.classList.add('hidden');
});

// Progress logging
function addLogEntry(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// Set up progress listener
window.siteToPdf.onProgress((message) => {
  let type = 'info';
  
  if (message.includes('✅') || message.toLowerCase().includes('success')) {
    type = 'success';
  } else if (message.includes('⚠') || message.toLowerCase().includes('warn')) {
    type = 'warning';
  } else if (message.includes('❌') || message.toLowerCase().includes('error')) {
    type = 'error';
  }
  
  addLogEntry(message, type);
});

// Set up error listener
window.siteToPdf.onError((message) => {
  addLogEntry(`Error: ${message}`, 'error');
  showResult(false, message);
  setConverting(false);
});

// Set up complete listener
window.siteToPdf.onComplete((data) => {
  const filename = data.outputPath.split(/[\\/]/).pop();
  addLogEntry(`✅ PDF generated successfully: ${filename}`, 'success');
  showResult(true, data.outputPath);
  setConverting(false);
});

// Form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (isConverting) {
    return;
  }
  
  // Hide previous results
  resultCard.classList.add('hidden');
  summaryCard.classList.add('hidden');

  // Summarize mode
  if (currentMode === 'summarize') {
    await handleSummarize();
    return;
  }
  
  setConverting(true);
  addLogEntry('Starting conversion...', 'info');

  // Auto-scroll to progress section
  document.getElementById('progressCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  try {
    const commonOptions = {
      format: formatSelect.value,
      compress: compressToggle.checked,
      output: outputPath.value || undefined,
    };
    
    if (currentMode === 'single') {
      await window.siteToPdf.convertSingle({
        url: urlInput.value,
        ...commonOptions,
      });
    } else if (currentMode === 'crawl') {
      await window.siteToPdf.convertCrawl({
        startUrl: urlInput.value,
        maxDepth: parseInt(maxDepth.value),
        maxPages: parseInt(maxPages.value),
        delay: parseInt(crawlDelay.value),
        ...commonOptions,
      });
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
      
      await window.siteToPdf.convertList({
        urls,
        ...commonOptions,
      });
    }
  } catch (error) {
    addLogEntry(`Error: ${error.message}`, 'error');
    showResult(false, error.message);
    setConverting(false);
  }
});

// Summarize handler
async function handleSummarize() {
  const url = urlInput.value.trim();
  if (!url) {
    addLogEntry('Please enter a URL to summarize', 'error');
    return;
  }

  setConverting(true);
  addLogEntry('Starting summarization...', 'info');

  // Auto-scroll to progress section
  document.getElementById('progressCard').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const language = summaryLangSelect.value;
    const result = await window.siteToPdf.summarizeContent({ url, language });

    if (result.success) {
      showSummary(result.title, result.summary);
    }
  } catch (error) {
    if (error.message && error.message.includes('NO_API_KEY')) {
      addLogEntry('No Gemini API key configured. Please open Settings to add your key.', 'error');
      showResult(false, 'No API key set. Click the ⚙ gear icon in the header to configure your Gemini API key.');
    } else if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
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

function showSummary(title, summaryText) {
  summaryCard.classList.remove('hidden');
  summaryTitle.textContent = title || 'Summary';
  // Convert markdown-like line breaks to HTML
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
    btnText.textContent = currentMode === 'summarize' ? 'Summarizing...' : 'Converting...';
    btnSpinner.classList.remove('hidden');
  } else {
    btnText.textContent = currentMode === 'summarize' ? 'Summarize' : 'Convert to PDF';
    btnSpinner.classList.add('hidden');
  }
}

function showResult(success, data) {
  resultCard.classList.remove('hidden');
  
  if (success) {
    const filename = data.split(/[\\/]/).pop();
    resultContent.innerHTML = `
      <div class="result-success">
        <div class="result-message success">
          <span>✅</span>
          <span>PDF generated successfully: ${filename}</span>
        </div>
        <div class="result-actions">
          <button id="openPdfBtn">Open PDF</button>
          <button id="openFolderBtn">Open Folder</button>
        </div>
      </div>
    `;
    
    document.getElementById('openPdfBtn').addEventListener('click', () => {
      window.siteToPdf.openFile(data);
    });
    
    document.getElementById('openFolderBtn').addEventListener('click', () => {
      window.siteToPdf.openFolder(data);
    });
  } else {
    resultContent.innerHTML = `
      <div class="result-message error">
        <span>❌</span>
        <span>Error: ${data}</span>
      </div>
    `;
  }
}

// --- Settings Modal ---
const geminiModelSelect = document.getElementById('geminiModelSelect');

settingsBtn.addEventListener('click', async () => {
  settingsModal.classList.remove('hidden');
  await loadApiKeyStatus();
  await loadModelSetting();
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  apiKeyInput.value = '';
});

// Close modal on overlay click
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.add('hidden');
    apiKeyInput.value = '';
  }
});

async function loadApiKeyStatus() {
  try {
    const result = await window.siteToPdf.getApiKey();
    if (result.masked) {
      keyStatusText.textContent = `Current key: ${result.masked}`;
      keyStatus.classList.add('has-key');
      clearApiKeyBtn.classList.remove('hidden');
    } else {
      keyStatusText.textContent = 'No API key set';
      keyStatus.classList.remove('has-key');
      clearApiKeyBtn.classList.add('hidden');
    }
  } catch {
    keyStatusText.textContent = 'Error loading key status';
  }
}

saveApiKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;

  try {
    const result = await window.siteToPdf.setApiKey(key);
    if (result.success) {
      apiKeyInput.value = '';
      keyStatusText.textContent = `Current key: ${result.masked}`;
      keyStatus.classList.add('has-key');
      clearApiKeyBtn.classList.remove('hidden');
      addLogEntry('API key saved successfully', 'success');
    }
  } catch (error) {
    addLogEntry(`Failed to save API key: ${error.message}`, 'error');
  }
});

clearApiKeyBtn.addEventListener('click', async () => {
  try {
    await window.siteToPdf.clearApiKey();
    keyStatusText.textContent = 'No API key set';
    keyStatus.classList.remove('has-key');
    clearApiKeyBtn.classList.add('hidden');
    addLogEntry('API key cleared', 'info');
  } catch (error) {
    addLogEntry(`Failed to clear API key: ${error.message}`, 'error');
  }
});

async function loadModelSetting() {
  try {
    const model = await window.siteToPdf.getModel();
    geminiModelSelect.value = model;
  } catch {}
}

geminiModelSelect.addEventListener('change', async () => {
  try {
    await window.siteToPdf.setModel(geminiModelSelect.value);
    addLogEntry(`Gemini model set to ${geminiModelSelect.value}`, 'info');
  } catch (error) {
    addLogEntry(`Failed to save model: ${error.message}`, 'error');
  }
});

// Auto-update listeners
const updatePercent = document.getElementById('updatePercent');
const updateProgressContainer = document.getElementById('updateProgressContainer');
const updateProgressBar = document.getElementById('updateProgressBar');
let pendingUpdateVersion = null; // tracks downloaded update for "reopen" button

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showUpdateReady(version) {
  pendingUpdateVersion = version;
  updateBar.classList.remove('hidden', 'downloading');
  updateMessage.textContent = `Update v${version} ready to install.`;
  updateAction.classList.remove('hidden');
  updatePercent.classList.add('hidden');
  updateProgressContainer.classList.add('hidden');
}

function showDownloading(version) {
  updateBar.classList.remove('hidden');
  updateBar.classList.add('downloading');
  updateMessage.textContent = `Downloading update v${version}...`;
  updateAction.classList.add('hidden');
  updatePercent.classList.remove('hidden');
  updatePercent.textContent = '0%';
  updateProgressContainer.classList.remove('hidden');
  updateProgressBar.style.width = '0%';
}

window.siteToPdf.onUpdateAvailable((data) => {
  showDownloading(data.version);
});

window.siteToPdf.onDownloadProgress((data) => {
  const pct = data.percent;
  updateProgressBar.style.width = pct + '%';
  updatePercent.textContent = pct + '%';
  const speed = formatBytes(data.bytesPerSecond) + '/s';
  const transferred = formatBytes(data.transferred);
  const total = formatBytes(data.total);
  updateMessage.textContent = `Downloading update — ${transferred} / ${total} (${speed})`;
});

window.siteToPdf.onUpdateDownloaded((data) => {
  showUpdateReady(data.version);
});

updateAction.addEventListener('click', () => {
  window.siteToPdf.installUpdate();
});

updateDismiss.addEventListener('click', () => {
  updateBar.classList.add('hidden');
  // If an update is ready, show "Restart & Update" on the check button
  if (pendingUpdateVersion) {
    checkUpdateLabel.textContent = 'Restart & Update';
    checkUpdateBtn.classList.remove('update-found');
    checkUpdateBtn.classList.add('update-ready');
    checkUpdateBtn.disabled = false;
  }
});

// Check for Update button
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const checkUpdateLabel = document.getElementById('checkUpdateLabel');

async function performUpdateCheck() {
  // If update already downloaded, just reopen the update bar or install
  if (pendingUpdateVersion) {
    showUpdateReady(pendingUpdateVersion);
    return;
  }

  if (checkUpdateBtn.disabled) return;
  checkUpdateBtn.disabled = true;
  checkUpdateLabel.textContent = 'Checking...';
  checkUpdateBtn.classList.add('checking');

  try {
    const result = await window.siteToPdf.checkForUpdate();
    if (result.status === 'downloaded') {
      // Update already downloaded — show "ready to install" immediately
      checkUpdateBtn.classList.remove('checking');
      showUpdateReady(result.version);
      checkUpdateBtn.disabled = false;
      return;
    } else if (result.status === 'downloading') {
      // Download in progress — show the progress bar
      checkUpdateBtn.classList.remove('checking');
      showDownloading(result.version);
      checkUpdateBtn.disabled = false;
      return;
    } else if (result.status === 'available') {
      checkUpdateLabel.textContent = `v${result.version} available!`;
      checkUpdateBtn.classList.remove('checking');
      checkUpdateBtn.classList.add('update-found');
    } else if (result.status === 'up-to-date') {
      checkUpdateLabel.textContent = result.message || "You're up to date!";
      checkUpdateBtn.classList.remove('checking');
      setTimeout(() => {
        checkUpdateLabel.textContent = 'Check for Update';
        checkUpdateBtn.disabled = false;
        checkUpdateBtn.classList.remove('update-found');
      }, 3000);
      return;
    } else if (result.status === 'no-releases') {
      checkUpdateLabel.textContent = result.message || 'No releases yet';
      checkUpdateBtn.classList.remove('checking');
      setTimeout(() => {
        checkUpdateLabel.textContent = 'Check for Update';
        checkUpdateBtn.disabled = false;
      }, 4000);
      return;
    } else {
      checkUpdateLabel.textContent = result.message || 'Check failed';
      checkUpdateBtn.classList.remove('checking');
      setTimeout(() => {
        checkUpdateLabel.textContent = 'Check for Update';
        checkUpdateBtn.disabled = false;
      }, 3000);
      return;
    }
  } catch (error) {
    checkUpdateLabel.textContent = 'Check failed';
    checkUpdateBtn.classList.remove('checking');
    setTimeout(() => {
      checkUpdateLabel.textContent = 'Check for Update';
      checkUpdateBtn.disabled = false;
    }, 3000);
    return;
  }

  setTimeout(() => {
    checkUpdateLabel.textContent = 'Check for Update';
    checkUpdateBtn.disabled = false;
    checkUpdateBtn.classList.remove('update-found');
  }, 5000);
}

checkUpdateBtn.addEventListener('click', () => {
  // If update is downloaded and button shows "Restart & Update", install directly
  if (checkUpdateBtn.classList.contains('update-ready')) {
    window.siteToPdf.installUpdate();
    return;
  }
  performUpdateCheck();
});

// Listen for menu-triggered update check
window.siteToPdf.onTriggerCheckForUpdate(() => {
  performUpdateCheck();
});

// Load default output directory
async function initDefaultOutputDir() {
  try {
    defaultOutputDir = await window.siteToPdf.getDefaultOutputDir();
    if (defaultOutputDir && !outputPath.value) {
      outputPath.placeholder = `Default: ${defaultOutputDir}`;
    }
  } catch (err) {
    // Non-critical — just keep the static placeholder
  }
}

// Initialize
updateVisibleSections();
initDefaultOutputDir();
