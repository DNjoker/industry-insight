export interface ElectronAPI {
  getBackendUrl: () => Promise<string>
  selectFolder: () => Promise<string | null>
  openFolder: (path: string) => Promise<string>
  selectReport: () => Promise<string | null>
  downloadImages: (urls: string[]) => Promise<string[]>
  captureWebview: (webContentsId: number) => Promise<any>
  openExternal: (url: string) => Promise<void>
  onBackendStatus: (callback: (status: string) => void) => void
  encryptString: (plaintext: string) => Promise<string>
  decryptString: (encrypted: string) => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
