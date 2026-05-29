import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (path: string) => ipcRenderer.invoke('open-folder', path),
  selectReport: () => ipcRenderer.invoke('select-report'),
  onBackendStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('backend-status', (_event, status) => callback(status))
  },
  downloadImages: (urls: string[]) => ipcRenderer.invoke('download-images', urls),
  captureWebview: (webContentsId: number) => ipcRenderer.invoke('capture-webview', webContentsId),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
})
