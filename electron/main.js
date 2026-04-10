const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');

let mainWindow;
let isConverting = false;

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
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About SiteToPdf',
              message: 'SiteToPdf',
              detail: 'Convert web pages to clean PDFs\nVersion 0.1.0',
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
ipcMain.handle('convert:single', async (event, options) => {
  if (isConverting) {
    throw new Error('Conversion already in progress');
  }

  isConverting = true;
  const win = BrowserWindow.fromWebContents(event.sender);

  try {
    const { runSingleUrl, shutdown } = require(path.join(__dirname, '..', 'dist', 'pipeline.js'));

    const outputPath = await withProgressForwarding(win, () => runSingleUrl(options));

    await shutdown();
    isConverting = false;

    if (win && !win.isDestroyed()) {
      win.webContents.send('complete', { outputPath });
    }

    return { success: true, outputPath };
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

    const outputPath = await withProgressForwarding(win, () => runCrawl(crawlOptions));

    await shutdown();
    isConverting = false;

    if (win && !win.isDestroyed()) {
      win.webContents.send('complete', { outputPath });
    }

    return { success: true, outputPath };
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

    const outputPath = await withProgressForwarding(win, () => runList(options));

    await shutdown();
    isConverting = false;

    if (win && !win.isDestroyed()) {
      win.webContents.send('complete', { outputPath });
    }

    return { success: true, outputPath };
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

ipcMain.handle('dialog:save', async (event, defaultFilename) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Save PDF',
    defaultPath: defaultFilename || 'output.pdf',
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
  createWindow();

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
