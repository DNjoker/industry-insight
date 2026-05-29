import { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import net from 'net'
import fs from 'fs'
import https from 'https'
import http from 'http'

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
const BACKEND_PORT = 19877

function getBackendUrl(): string {
  return `http://127.0.0.1:${BACKEND_PORT}`
}

function startPythonBackend(): void {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  const userDataPath = app.getPath('userData')
  const dotenvTarget = path.join(userDataPath, '.env')

  if (isDev) {
    // DEVELOPMENT: Use venv Python + uvicorn
    const projectRoot = path.join(__dirname, '..')
    const venvPython = process.platform === 'win32'
      ? path.join(projectRoot, 'venv', 'Scripts', 'python.exe')
      : path.join(projectRoot, 'venv', 'bin', 'python')
    const systemPython = process.platform === 'win32' ? 'python' : 'python3'
    const pythonExe = fs.existsSync(venvPython) ? venvPython : systemPython

    console.log(`[Dev Python] Using: ${pythonExe}`)

    pythonProcess = spawn(pythonExe, [
      '-m', 'uvicorn', 'backend.main:app',
      '--host', '127.0.0.1', '--port', String(BACKEND_PORT),
      '--reload',
    ], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })
  } else {
    // PRODUCTION: Use PyInstaller-packaged backend exe
    const backendExe = path.join(
      process.resourcesPath,
      'backend-dist',
      'run_backend.exe',
    )

    if (!fs.existsSync(backendExe)) {
      console.error(`[Backend] Not found: ${backendExe}`)
      dialog.showErrorBox(
        '启动失败',
        `找不到后端程序:\n${backendExe}\n\n请重新安装应用。`,
      )
      return
    }

    console.log(`[Backend] Starting: ${backendExe}`)

    pythonProcess = spawn(backendExe, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CHROMA_DATA_DIR: userDataPath,
        DOTENV_PATH: dotenvTarget,
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: String(BACKEND_PORT),
      },
    })
  }

  pythonProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[Python] ${data.toString().trim()}`)
  })

  pythonProcess.stderr?.on('data', (data: Buffer) => {
    console.log(`[Python] ${data.toString().trim()}`)
  })

  pythonProcess.on('close', (code: number | null) => {
    console.log(`[Python] Process exited with code ${code}`)
    pythonProcess = null
  })
}

function waitForBackend(maxRetries = 30): Promise<boolean> {
  return new Promise((resolve) => {
    let retries = 0
    const check = () => {
      retries++
      const client = new net.Socket()
      client.connect(BACKEND_PORT, '127.0.0.1', () => {
        client.destroy()
        resolve(true)
      })
      client.on('error', () => {
        client.destroy()
        if (retries >= maxRetries) {
          resolve(false)
        } else {
          setTimeout(check, 1000)
        }
      })
    }
    check()
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '信息汇总桌面工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// IPC handlers
function setupIpcHandlers(): void {
  ipcMain.handle('get-backend-url', () => getBackendUrl())

  ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('open-folder', async (_event, folderPath: string) => {
    const result = await shell.openPath(folderPath)
    return result  // '' on success, error message on failure
  })

  ipcMain.handle('select-report', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择行业摸底报告',
      filters: [{ name: 'Markdown 文件', extensions: ['md'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Webview capture: download images from URLs to local temp files
  ipcMain.handle('download-images', async (_event, urls: string[]) => {
    const tempDir = path.join(app.getPath('temp'), 'competitor-images')
    fs.mkdirSync(tempDir, { recursive: true })

    const results: (string | null)[] = new Array(urls.length).fill(null)
    const batchSize = 8
    for (let start = 0; start < urls.length; start += batchSize) {
      const batch = urls.slice(start, start + batchSize).map(async (url, batchIdx) => {
        const i = start + batchIdx
        try {
          const ext = url.match(/\.(png|jpg|jpeg|webp)(\?|$)/i)?.[1] || 'png'
          const filename = `${Date.now()}_${i}.${ext}`
          const filepath = path.join(tempDir, filename)
          await downloadFile(url, filepath)
          results[i] = filepath
        } catch (e) {
          console.error(`Failed to download ${url}:`, e)
        }
      })
      await Promise.all(batch)
    }
    return results.filter(Boolean) as string[]
  })

  // Execute JS in webview to extract page content
  ipcMain.handle('capture-webview', async (_event, webContentsId: number) => {
    try {
      const wc = (global as any).__webContentsMap?.get(webContentsId)
        || require('electron').webContents.fromId(webContentsId)
      if (!wc) return { error: 'WebContents not found' }

      const result = await wc.executeJavaScript(`
        (function() {
          const images = [];
          // Main product images
          document.querySelectorAll('img').forEach(img => {
            const src = img.src || img.getAttribute('data-src') || '';
            if (src && src.startsWith('http') && img.naturalWidth > 200) {
              images.push({ url: src, width: img.naturalWidth, height: img.naturalHeight, alt: img.alt || '' });
            }
          });

          // Text content
          const textElements = [];
          document.querySelectorAll('h1,h2,h3,h4,.title,.sellpoint,.desc,p').forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 5 && text.length < 500) {
              textElements.push({ tag: el.tagName, text: text.substring(0, 300) });
            }
          });

          return {
            title: document.title,
            url: location.href,
            images: images.slice(0, 30),
            texts: textElements.slice(0, 50),
            bodyText: document.body?.innerText?.substring(0, 3000) || '',
          };
        })()
      `)

      return result
    } catch (e: any) {
      return { error: e.message }
    }
  })

  // Open a URL in the default browser
  ipcMain.handle('open-external', async (_event, url: string) => {
    return shell.openExternal(url)
  })
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, (res) => {
      // Handle redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
    }).on('error', reject)
  })
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  startPythonBackend()
  setupIpcHandlers()
  createWindow()

  const backendReady = await waitForBackend()
  if (backendReady && mainWindow) {
    mainWindow.webContents.send('backend-status', 'connected')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill()
    pythonProcess = null
  }
})
