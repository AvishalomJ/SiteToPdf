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
const translateSelect = document.getElementById('translateSelect');
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
  if (currentMode === 'single') {
    singleUrlSection.classList.remove('hidden');
    urlListSection.classList.add('hidden');
    crawlOptionsSection.classList.add('hidden');
    urlInput.required = true;
    urlListInput.required = false;
  } else if (currentMode === 'crawl') {
    singleUrlSection.classList.remove('hidden');
    urlListSection.classList.add('hidden');
    crawlOptionsSection.classList.remove('hidden');
    urlInput.required = true;
    urlListInput.required = false;
  } else if (currentMode === 'list') {
    singleUrlSection.classList.add('hidden');
    urlListSection.classList.remove('hidden');
    crawlOptionsSection.classList.add('hidden');
    urlInput.required = false;
    urlListInput.required = true;
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
  
  // Hide previous result
  resultCard.classList.add('hidden');
  
  setConverting(true);
  addLogEntry('Starting conversion...', 'info');
  
  try {
    const commonOptions = {
      format: formatSelect.value,
      compress: compressToggle.checked,
      translate: translateSelect.value || undefined,
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

function setConverting(converting) {
  isConverting = converting;
  convertBtn.disabled = converting;
  
  if (converting) {
    btnText.textContent = 'Converting...';
    btnSpinner.classList.remove('hidden');
  } else {
    btnText.textContent = 'Convert to PDF';
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

// Auto-update listeners
window.siteToPdf.onUpdateAvailable((data) => {
  updateBar.classList.remove('hidden');
  updateBar.classList.add('downloading');
  updateMessage.textContent = `Downloading update v${data.version}...`;
  updateAction.classList.add('hidden');
});

window.siteToPdf.onUpdateDownloaded((data) => {
  updateBar.classList.remove('hidden', 'downloading');
  updateMessage.textContent = `Update v${data.version} ready to install.`;
  updateAction.classList.remove('hidden');
});

updateAction.addEventListener('click', () => {
  window.siteToPdf.installUpdate();
});

updateDismiss.addEventListener('click', () => {
  updateBar.classList.add('hidden');
});

// Check for Update button
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const checkUpdateLabel = document.getElementById('checkUpdateLabel');

async function performUpdateCheck() {
  if (checkUpdateBtn.disabled) return;
  checkUpdateBtn.disabled = true;
  checkUpdateLabel.textContent = 'Checking...';
  checkUpdateBtn.classList.add('checking');

  try {
    const result = await window.siteToPdf.checkForUpdate();
    if (result.status === 'available') {
      checkUpdateLabel.textContent = `v${result.version} available!`;
      checkUpdateBtn.classList.remove('checking');
      checkUpdateBtn.classList.add('update-found');
    } else if (result.status === 'up-to-date') {
      checkUpdateLabel.textContent = "You're up to date!";
      checkUpdateBtn.classList.remove('checking');
      setTimeout(() => {
        checkUpdateLabel.textContent = 'Check for Update';
        checkUpdateBtn.disabled = false;
        checkUpdateBtn.classList.remove('update-found');
      }, 3000);
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

checkUpdateBtn.addEventListener('click', performUpdateCheck);

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
