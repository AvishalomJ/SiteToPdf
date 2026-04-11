const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow;
let isConverting = false;

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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', (err) => {
    // Silently log update errors — don't interrupt user workflow
    console.error('Auto-updater error:', err.message);
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
              detail: `Convert web pages to clean PDFs\nVersion ${app.getVersion()}`,
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
      translate: options.translate,
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
  try {
    const result = await autoUpdater.checkForUpdatesAndNotify();
    if (result && result.updateInfo && result.updateInfo.version) {
      return { status: 'available', version: result.updateInfo.version };
    }
    return { status: 'up-to-date', message: "You're up to date!" };
  } catch (error) {
    // "Latest version" errors mean no update is available
    if (error.message && error.message.includes('No published versions')) {
      return { status: 'up-to-date', message: "You're up to date!" };
    }
    return { status: 'error', message: error.message || 'Failed to check for updates' };
  }
});

ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall(false, true);
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
