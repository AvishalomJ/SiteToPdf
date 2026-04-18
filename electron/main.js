const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { PDFDocument } = require('pdf-lib');

let mainWindow;
let isConverting = false;
let updateState = { status: 'idle', version: null }; // idle | downloading | downloaded

// Default output directory: Documents/SiteToPdf
function getDefaultOutputDir() {
  const docsDir = app.getPath('documents');
  return path.join(docsDir, 'SiteToPdf');
}

function ensureDefaultOutputDir() {
  const dir = getDefaultOutputDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Auto-updater setup
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    updateState = { status: 'downloading', version: info.version };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateState = { status: 'downloaded', version: info.version };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
    // Reset state so the next check can retry
    if (updateState.status === 'downloading') {
      updateState = { status: 'idle', version: null };
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', { message: err.message });
    }
  });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Ignore check errors (offline, no releases, etc.)
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: null,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Set up menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('trigger-check-for-update');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About SiteToPdf',
              message: 'SiteToPdf',
              detail: `Convert, merge & transform — your all-in-one PDF toolkit\nVersion ${app.getVersion()}`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function withProgressForwarding(win, fn) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => {
    const msg = args.map(String).join(' ');
    originalLog(...args);
    if (win && !win.isDestroyed()) {
      win.webContents.send('progress', msg);
    }
  };

  console.warn = (...args) => {
    const msg = args.map(String).join(' ');
    originalWarn(...args);
    if (win && !win.isDestroyed()) {
      win.webContents.send('progress', `⚠ ${msg}`);
    }
  };

  console.error = (...args) => {
    const msg = args.map(String).join(' ');
    originalError(...args);
    if (win && !win.isDestroyed()) {
      win.webContents.send('progress', `❌ ${msg}`);
    }
  };

  return fn().finally(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  });
}

// IPC Handlers

// Temporarily change CWD to default output dir when no output path is specified
function withDefaultOutputDir(options, fn) {
  if (!options.output) {
    const originalCwd = process.cwd();
    const defaultDir = ensureDefaultOutputDir();
    process.chdir(defaultDir);
    return fn().finally(() => process.chdir(originalCwd));
  }
  return fn();
}

ipcMain.handle('convert:single', async (event, options) => {
  if (isConverting) {
    throw new Error('Conversion already in progress');
  }

  isConverting = true;
  const win = BrowserWindow.fromWebContents(event.sender);

  try {
    const { runSingleUrl, shutdown } = require(path.join(__dirname, '..', 'dist', 'pipeline.js'));

    const outputPath = await withDefaultOutputDir(options, () =>
      withProgressForwarding(win, () => runSingleUrl(options))
    );

    const resolvedPath = path.isAbsolute(outputPath) ? outputPath : path.join(
      options.output ? path.dirname(options.output) : getDefaultOutputDir(),
      outputPath
    );

    await shutdown();
    isConverting = false;

    if (win && !win.isDestroyed()) {
      win.webContents.send('complete', { outputPath: resolvedPath });
    }

    return { success: true, outputPath: resolvedPath };
  } catch (error) {
    isConverting = false;
    await require(path.join(__dirname, '..', 'dist', 'pipeline.js')).shutdown().catch(() => {});
    
    const errorMsg = error.message || String(error);
    if (win && !win.isDestroyed()) {
      win.webContents.send('error', errorMsg);
    }
    throw error;
  }
});

ipcMain.handle('convert:crawl', async (event, options) => {
  if (isConverting) {
    throw new Error('Conversion already in progress');
  }

  isConverting = true;
  const win = BrowserWindow.fromWebContents(event.sender);

  try {
    const { runCrawl, shutdown } = require(path.join(__dirname, '..', 'dist', 'pipeline.js'));

    // Map renderer field names to pipeline's CrawlPipelineOptions
    const crawlOptions = {
      url: options.startUrl || options.url,
      output: options.output,
      format: options.format,
      depth: options.maxDepth,
      maxPages: options.maxPages,
      delay: options.delay,
      compress: options.compress,
    };

    const outputPath = await withDefaultOutputDir(crawlOptions, () =>
      withProgressForwarding(win, () => runCrawl(crawlOptions))
    );

    const resolvedPath = path.isAbsolute(outputPath) ? outputPath : path.join(
      crawlOptions.output ? path.dirname(crawlOptions.output) : getDefaultOutputDir(),
      outputPath
    );

    await shutdown();
    isConverting = false;

    if (win && !win.isDestroyed()) {
      win.webContents.send('complete', { outputPath: resolvedPath });
    }

    return { success: true, outputPath: resolvedPath };
  } catch (error) {
    isConverting = false;
    await require(path.join(__dirname, '..', 'dist', 'pipeline.js')).shutdown().catch(() => {});
    
    const errorMsg = error.message || String(error);
    if (win && !win.isDestroyed()) {
      win.webContents.send('error', errorMsg);
    }
    throw error;
  }
});

ipcMain.handle('convert:list', async (event, options) => {
  if (isConverting) {
    throw new Error('Conversion already in progress');
  }

  isConverting = true;
  const win = BrowserWindow.fromWebContents(event.sender);

  try {
    const { runList, shutdown } = require(path.join(__dirname, '..', 'dist', 'pipeline.js'));

    const outputPath = await withDefaultOutputDir(options, () =>
      withProgressForwarding(win, () => runList(options))
    );

    const resolvedPath = path.isAbsolute(outputPath) ? outputPath : path.join(
      options.output ? path.dirname(options.output) : getDefaultOutputDir(),
      outputPath
    );

    await shutdown();
    isConverting = false;

    if (win && !win.isDestroyed()) {
      win.webContents.send('complete', { outputPath: resolvedPath });
    }

    return { success: true, outputPath: resolvedPath };
  } catch (error) {
    isConverting = false;
    await require(path.join(__dirname, '..', 'dist', 'pipeline.js')).shutdown().catch(() => {});
    
    const errorMsg = error.message || String(error);
    if (win && !win.isDestroyed()) {
      win.webContents.send('error', errorMsg);
    }
    throw error;
  }
});

ipcMain.handle('convert:cancel', async () => {
  // Future: implement cancellation
  return { success: false, message: 'Cancellation not yet implemented' };
});

ipcMain.handle('get:defaultOutputDir', async () => {
  return ensureDefaultOutputDir();
});

ipcMain.handle('check-for-update', async () => {
  // If update already downloaded, skip the network check
  if (updateState.status === 'downloaded') {
    return { status: 'downloaded', version: updateState.version };
  }
  // If currently downloading, tell the renderer to show the bar
  if (updateState.status === 'downloading') {
    return { status: 'downloading', version: updateState.version };
  }
  try {
    const result = await autoUpdater.checkForUpdatesAndNotify();
    if (result && result.updateInfo && result.updateInfo.version) {
      const currentVersion = app.getVersion();
      if (result.updateInfo.version === currentVersion) {
        return { status: 'up-to-date', message: `You're on the latest version (v${currentVersion})` };
      }
      return { status: 'available', version: result.updateInfo.version };
    }
    return { status: 'up-to-date', message: `You're on v${app.getVersion()} — no newer release found.` };
  } catch (error) {
    if (error.message && (error.message.includes('No published versions') || error.message.includes('HttpError') || error.message.includes('404'))) {
      return { status: 'no-releases', message: `No releases published yet. Current: v${app.getVersion()}` };
    }
    if (error.message && error.message.includes('net::')) {
      return { status: 'error', message: 'Network error — check your internet connection.' };
    }
    return { status: 'error', message: error.message || 'Failed to check for updates' };
  }
});

ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall(true, true);
});

// --- PDF Merge ---

ipcMain.handle('dialog:open-pdfs', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Select PDF Files to Merge',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

// --- Image to PDF ---

ipcMain.handle('dialog:open-images', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Image Files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle('convert:images-to-pdf', async (event, { files, outputPath: userOutputPath }) => {
  if (isConverting) {
    return { success: false, error: 'A conversion is already in progress' };
  }

  if (!files || files.length === 0) {
    return { success: false, error: 'Please select at least one image file' };
  }

  for (const file of files) {
    if (!fs.existsSync(file)) {
      return { success: false, error: `File not found: ${path.basename(file)}` };
    }
  }

  isConverting = true;
  const win = BrowserWindow.fromWebContents(event.sender);

  const sendProgress = (msg) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('progress', msg);
    }
  };

  try {
    sendProgress(`Converting ${files.length} image(s) to PDF...`);
    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = path.basename(file);
      const ext = path.extname(file).toLowerCase();
      sendProgress(`Processing (${i + 1}/${files.length}): ${filename}`);

      const imageBytes = fs.readFileSync(file);
      let image;

      if (ext === '.png') {
        image = await pdfDoc.embedPng(imageBytes);
      } else if (ext === '.jpg' || ext === '.jpeg') {
        image = await pdfDoc.embedJpg(imageBytes);
      } else {
        sendProgress(`⚠ Skipping unsupported format: ${filename}`);
        continue;
      }

      const { width, height } = image;
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
    }

    if (pdfDoc.getPageCount() === 0) {
      isConverting = false;
      return { success: false, error: 'No valid images were processed' };
    }

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const defaultFilename = `images-${ts}.pdf`;
    let finalPath;
    if (userOutputPath) {
      finalPath = userOutputPath;
    } else {
      const outputDir = ensureDefaultOutputDir();
      finalPath = path.join(outputDir, defaultFilename);
    }

    sendProgress('Saving PDF...');
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(finalPath, pdfBytes);

    const totalPages = pdfDoc.getPageCount();
    sendProgress(`✅ Converted ${totalPages} image(s) into ${path.basename(finalPath)}`);

    isConverting = false;

    if (win && !win.isDestroyed()) {
      win.webContents.send('complete', { outputPath: finalPath });
    }

    return { success: true, outputPath: finalPath };
  } catch (error) {
    isConverting = false;
    const errorMsg = error.message || String(error);
    console.error('[convert:images-to-pdf] Error:', errorMsg, error.stack);
    sendProgress(`❌ Image conversion failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('merge:pdfs', async (event, { files, outputPath: userOutputPath }) => {
  if (isConverting) {
    return { success: false, error: 'A conversion is already in progress' };
  }

  if (!files || files.length < 2) {
    return { success: false, error: 'Please select at least 2 PDF files to merge' };
  }

  // Validate all files exist before starting
  for (const file of files) {
    if (!fs.existsSync(file)) {
      return { success: false, error: `File not found: ${path.basename(file)}` };
    }
  }

  isConverting = true;
  const win = BrowserWindow.fromWebContents(event.sender);

  const sendProgress = (msg) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('progress', msg);
    }
  };

  try {
    sendProgress(`Merging ${files.length} PDF files...`);
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = path.basename(file);
      sendProgress(`Processing (${i + 1}/${files.length}): ${filename}`);

      const bytes = fs.readFileSync(file);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    // Determine output path
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const defaultFilename = `merged-${ts}.pdf`;
    let finalPath;
    if (userOutputPath) {
      finalPath = userOutputPath;
    } else {
      const outputDir = ensureDefaultOutputDir();
      finalPath = path.join(outputDir, defaultFilename);
    }

    sendProgress('Saving merged PDF...');
    const mergedBytes = await mergedPdf.save();
    fs.writeFileSync(finalPath, mergedBytes);

    const totalPages = mergedPdf.getPageCount();
    sendProgress(`✅ Merged ${files.length} files (${totalPages} pages) into ${path.basename(finalPath)}`);

    isConverting = false;

    if (win && !win.isDestroyed()) {
      win.webContents.send('complete', { outputPath: finalPath });
    }

    return { success: true, outputPath: finalPath };
  } catch (error) {
    isConverting = false;
    const errorMsg = error.message || String(error);
    console.error('[merge:pdfs] Error:', errorMsg, error.stack);
    sendProgress(`❌ Merge failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('dialog:save', async (event, defaultFilename) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const defaultDir = getDefaultOutputDir();
  const defaultPath = defaultFilename
    ? path.join(defaultDir, defaultFilename)
    : path.join(defaultDir, 'output.pdf');

  const result = await dialog.showSaveDialog(win, {
    title: 'Save PDF',
    defaultPath,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });

  return result.filePath;
});

ipcMain.handle('dialog:open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dialog:open-folder', async (event, filePath) => {
  try {
    await shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// --- Settings (API Key Management) ---

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  try {
    const data = fs.readFileSync(getSettingsPath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}

ipcMain.handle('settings:get-api-key', async () => {
  const settings = readSettings();
  const key = settings.geminiApiKey || '';
  if (!key) return { key: '', masked: '' };
  const masked = key.length > 8
    ? key.slice(0, 4) + '...' + key.slice(-4)
    : '****';
  return { key: '', masked };
});

ipcMain.handle('settings:set-api-key', async (_event, apiKey) => {
  const settings = readSettings();
  settings.geminiApiKey = apiKey;
  writeSettings(settings);
  const masked = apiKey.length > 8
    ? apiKey.slice(0, 4) + '...' + apiKey.slice(-4)
    : '****';
  return { success: true, masked };
});

ipcMain.handle('settings:clear-api-key', async () => {
  const settings = readSettings();
  delete settings.geminiApiKey;
  writeSettings(settings);
  return { success: true };
});

// --- Gemini Summarization ---

const GEMINI_MODELS = {
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
};

function callGeminiApi(apiKey, prompt, model = 'gemini-2.5-flash') {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    });

    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            const msg = json.error.message || 'Gemini API error';
            const err = new Error(msg);
            err.status = json.error.code;
            err.isQuota = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate');
            // Extract retry delay if present
            const retryMatch = msg.match(/retry in ([\d.]+)s/i);
            if (retryMatch) err.retryAfter = Math.ceil(parseFloat(retryMatch[1]));
            reject(err);
            return;
          }
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            reject(new Error('No content returned from Gemini API'));
            return;
          }
          resolve(text);
        } catch (e) {
          reject(new Error('Failed to parse Gemini API response'));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });
    req.write(body);
    req.end();
  });
}

async function callGeminiWithRetry(apiKey, prompt, model, sendProgress, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callGeminiApi(apiKey, prompt, model);
    } catch (error) {
      if (error.isQuota && error.retryAfter && attempt < maxRetries) {
        const waitSec = Math.min(error.retryAfter + 1, 30);
        sendProgress(`⏳ Rate limited — retrying in ${waitSec}s...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        sendProgress(`🔄 Retrying request (attempt ${attempt + 2})...`);
        continue;
      }
      // Friendlier error messages
      if (error.isQuota) {
        throw new Error(
          'QUOTA_EXCEEDED: Your Gemini API quota is exhausted. ' +
          'Either enable billing at ai.google.dev or try a different model (e.g., Gemini 1.5 Flash).'
        );
      }
      throw error;
    }
  }
}

ipcMain.handle('settings:get-model', async () => {
  const settings = readSettings();
  return settings.geminiModel || 'gemini-2.5-flash';
});

ipcMain.handle('settings:set-model', async (_event, model) => {
  const settings = readSettings();
  settings.geminiModel = model;
  writeSettings(settings);
  return { success: true };
});

// Generate a summary-specific output filename from a URL
function generateSummaryFilename(url, language) {
  const LANG_CODES = {
    'Hebrew': 'he', 'Arabic': 'ar', 'Spanish': 'es', 'French': 'fr',
    'German': 'de', 'Italian': 'it', 'Portuguese': 'pt', 'Russian': 'ru',
    'Chinese': 'zh', 'Japanese': 'ja', 'Korean': 'ko',
  };
  try {
    const parsed = new URL(url);
    const raw = (parsed.hostname + parsed.pathname)
      .replace(/[.\/_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    const base = raw.slice(0, 70) || 'output';
    const langSuffix = language && language !== 'English' && LANG_CODES[language]
      ? `-${LANG_CODES[language]}` : '';
    return `${base}-summary${langSuffix}.pdf`;
  } catch {
    return 'summary.pdf';
  }
}

// Convert plain/markdown summary text to simple HTML paragraphs
function summaryToHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .split(/\n\n+/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

ipcMain.handle('summarize:content', async (event, { url, language, model: requestModel }) => {
  const win = BrowserWindow.fromWebContents(event.sender);

  // Check for API key
  const settings = readSettings();
  const apiKey = settings.geminiApiKey;
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const model = requestModel || settings.geminiModel || 'gemini-2.5-flash';
  const modelLabel = GEMINI_MODELS[model] || model;

  const sendProgress = (msg) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('progress', msg);
    }
  };

  try {
    sendProgress(`Fetching content from ${url}...`);

    // Use the existing pipeline modules to fetch and extract content
    const { fetchUrl } = require(path.join(__dirname, '..', 'dist', 'fetcher.js'));
    const { extractContent } = require(path.join(__dirname, '..', 'dist', 'extractor.js'));
    const { generatePdf } = require(path.join(__dirname, '..', 'dist', 'pdf-generator.js'));
    const { shutdown } = require(path.join(__dirname, '..', 'dist', 'pipeline.js'));

    const fetchResult = await fetchUrl(url);
    const extracted = extractContent(fetchResult.html, url);

    const contentText = extracted.textContent || '';
    if (!contentText.trim()) {
      await shutdown();
      throw new Error('No text content could be extracted from this page.');
    }

    // Truncate to ~30k chars to stay within Gemini limits
    const truncated = contentText.length > 30000
      ? contentText.slice(0, 30000) + '\n\n[Content truncated for summarization]'
      : contentText;

    sendProgress(`Sending to ${modelLabel} for summarization in ${language}...`);

    const prompt = `Summarize this web page content in ${language}. Provide a clear, well-structured summary that captures the key points:\n\n${truncated}`;
    const summary = await callGeminiWithRetry(apiKey, prompt, model, sendProgress);

    // Generate summary PDF
    sendProgress('Generating summary PDF...');
    const summaryContent = {
      title: `Summary: ${extracted.title || url}`,
      contentHtml: summaryToHtml(summary),
      textContent: summary,
    };

    const outputDir = ensureDefaultOutputDir();
    const filename = generateSummaryFilename(url, language);
    const outputPath = path.join(outputDir, filename);

    await generatePdf(summaryContent, { outputPath, title: summaryContent.title }, url);
    await shutdown();

    sendProgress('✅ Summarization complete!');
    return { success: true, summary, title: extracted.title || url, outputPath };
  } catch (error) {
    // Clean up Playwright if it was started
    try {
      const { shutdown } = require(path.join(__dirname, '..', 'dist', 'pipeline.js'));
      await shutdown();
    } catch {}

    if (error.message === 'NO_API_KEY') throw error;

    // Friendlier error display
    let userMessage = error.message;
    if (error.message.startsWith('QUOTA_EXCEEDED:')) {
      userMessage = error.message.replace('QUOTA_EXCEEDED: ', '');
    }
    sendProgress(`❌ ${userMessage}`);
    throw error;
  }
});

// App lifecycle
app.whenReady().then(() => {
  ensureDefaultOutputDir();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  try {
    const { shutdown } = require(path.join(__dirname, '..', 'dist', 'pipeline.js'));
    await shutdown();
  } catch (error) {
    // Ignore shutdown errors during quit
  }
});
