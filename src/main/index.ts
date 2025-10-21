import 'dotenv/config'
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { Effect, Layer } from 'effect'
import { GitHubAuthService } from './github/auth-service'
import { GitHubApiService } from './github/api-service'
import { GitHubHttpService } from './github/http-service'
import { SecureStoreService } from './github/store-service'
import { setupGitHubIpcHandlers } from './ipc/github-handlers'
import { registerRoute } from '../lib/electron-router-dom'
import { makeAppSetup } from '../lib/electron-app/factories/app/setup'

// Protocol scheme for OAuth callbacks
const PROTOCOL_SCHEME = 'geppetto'

const MainLayer = Layer.mergeAll(
  GitHubHttpService.Default,
  SecureStoreService.Default,
  GitHubAuthService.Default,
  GitHubApiService.Default
)

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    center: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require.resolve('../preload/index.js'),
    },
  })

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show()

    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools()
    }
  })

  // Register the route with electron-router-dom
  registerRoute({
    id: 'main',
    browserWindow: mainWindow,
    htmlFile: join(__dirname, '../renderer/index.html'),
  })

  return mainWindow
}

// Register custom protocol handler for OAuth callbacks
// This must be done before app is ready
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [join(__dirname, '..')])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
}

let mainWindow: BrowserWindow | null = null

app.whenReady().then(async () => {
  Effect.runPromise(
    setupGitHubIpcHandlers.pipe(Effect.provide(MainLayer))
  )

  mainWindow = await makeAppSetup(async () => createMainWindow())
})

// Handle OAuth callback URLs on macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  console.log('[Protocol] Received URL (macOS):', url)

  if (url.startsWith(`${PROTOCOL_SCHEME}://`)) {
    // Forward to auth service via global event emitter
    app.emit('oauth-callback', url)

    // Bring app to foreground
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  }
})

// Handle OAuth callback URLs on Windows/Linux
// These platforms use second-instance for protocol handler URLs
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    console.log('[Protocol] Received command line (Windows/Linux):', commandLine)

    // Find protocol URL in command line arguments
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`))
    if (url) {
      console.log('[Protocol] Found OAuth callback URL:', url)
      app.emit('oauth-callback', url)
    }

    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
