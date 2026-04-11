const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('siteToPdf', {
  convertSingle: (options) => ipcRenderer.invoke('convert:single', options),
  convertCrawl: (options) => ipcRenderer.invoke('convert:crawl', options),
  convertList: (options) => ipcRenderer.invoke('convert:list', options),
  convertCancel: () => ipcRenderer.invoke('convert:cancel'),
  chooseSavePath: (defaultFilename) => ipcRenderer.invoke('dialog:save', defaultFilename),
  openFile: (path) => ipcRenderer.invoke('dialog:open-file', path),
  openFolder: (path) => ipcRenderer.invoke('dialog:open-folder', path),
  getDefaultOutputDir: () => ipcRenderer.invoke('get:defaultOutputDir'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  // Summarize
  summarizeContent: (options) => ipcRenderer.invoke('summarize:content', options),
  // Settings (API key management)
  getApiKey: () => ipcRenderer.invoke('settings:get-api-key'),
  setApiKey: (key) => ipcRenderer.invoke('settings:set-api-key', key),
  clearApiKey: () => ipcRenderer.invoke('settings:clear-api-key'),
  onTriggerCheckForUpdate: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('trigger-check-for-update', listener);
    return () => ipcRenderer.removeListener('trigger-check-for-update', listener);
  },
  onProgress: (callback) => {
    const listener = (_, msg) => callback(msg);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.removeListener('progress', listener);
  },
  onError: (callback) => {
    const listener = (_, msg) => callback(msg);
    ipcRenderer.on('error', listener);
    return () => ipcRenderer.removeListener('error', listener);
  },
  onComplete: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('complete', listener);
    return () => ipcRenderer.removeListener('complete', listener);
  },
  onUpdateAvailable: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('update-downloaded', listener);
    return () => ipcRenderer.removeListener('update-downloaded', listener);
  },
});
