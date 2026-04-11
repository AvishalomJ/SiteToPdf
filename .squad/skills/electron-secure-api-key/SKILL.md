# Skill: Secure API Key Management in Electron

## Pattern
Store API keys in `app.getPath('userData')/settings.json` — outside repo, local only.

## IPC Architecture
```
Renderer → ipcRenderer.invoke('settings:set-api-key', key) → Main Process writes to userData
Renderer → ipcRenderer.invoke('settings:get-api-key') → Main Process returns { masked } only
```

## Key Rules
1. **Never return the raw key to renderer** — only return a masked version via `get-api-key`.
2. **API calls happen in main process only** — renderer sends intent (url, params), main process adds the key and calls external API.
3. **Mask format:** `key.slice(0, 4) + '...' + key.slice(-4)` for display.
4. **Error sentinel:** Use `throw new Error('NO_API_KEY')` so renderer can show a friendly "configure your key" message.
5. **Node.js `https`:** Use built-in module for API calls — zero dependencies.

## Files Involved
- `electron/main.js` — `readSettings()`, `writeSettings()`, settings IPC handlers, API call function
- `electron/preload.js` — expose `getApiKey`, `setApiKey`, `clearApiKey` via contextBridge
- `electron/renderer/app.js` — settings modal logic
- `electron/renderer/index.html` — settings modal markup
- `electron/renderer/styles.css` — modal styles
