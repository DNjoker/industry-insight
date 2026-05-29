import { ipcMain, dialog, BrowserWindow } from 'electron'

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('get-backend-url', () => {
    return 'http://127.0.0.1:19877'
  })

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择 Obsidian Vault 目录',
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })
}
