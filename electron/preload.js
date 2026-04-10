const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('siteToPdf', {
  convertSingle: (options) => ipcRenderer.invoke('convert:single', options),
  convertCrawl: (options) => ipcRenderer.invoke('convert:crawl', options),
  convertList: (options) => ipcRenderer.invoke('convert:list', options),
  convertCancel: () => ipcRenderer.invoke('convert:cancel'),
  chooseSavePath: (defaultFilename) => ipcRenderer.invoke('dialog:save', defaultFilename),
  openFile: (path) => ipcRenderer.invoke('dialog:open-file', path),
  openFolder: (path) => ipcRenderer.invoke('dialog:open-folder', path),
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
});
