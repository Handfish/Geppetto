import 'dotenv/config'
import { app, BrowserWindow, globalShortcut } from 'electron'
import { join } from 'node:path'
import { Effect, Layer } from 'effect'
import { GitHubAuthService } from './github/auth-service'
import { GitHubApiService } from './github/api-service'
import { GitHubHttpService } from './github/http-service'
import { SecureStoreService } from './github/store-service'
import { TierService } from './tier/tier-service'
import { AccountContextService } from './account/account-context-service'
import { setupGitHubIpcHandlers } from './ipc/github-handlers'
import { setupAccountIpcHandlers } from './ipc/account-handlers'
import { registerRoute } from '../lib/electron-router-dom'
import { makeAppSetup } from '../lib/electron-app/factories/app/setup'

// Protocol scheme for OAuth callbacks
const PROTOCOL_SCHEME = 'geppetto'

const MainLayer = Layer.mergeAll(
  GitHubHttpService.Default,
  SecureStoreService.Default,
  TierService.Default,
  AccountContextService.Default,
  GitHubAuthService.Default,
  GitHubApiService.Default
)

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    fullscreen: true, // True fullscreen mode
    show: false,
    frame: false, // Borderless window
    transparent: true, // Transparent background
    autoHideMenuBar: true,
    backgroundColor: '#00000000', // Fully transparent
    hasShadow: false,
    skipTaskbar: false, // Keep in taskbar
    alwaysOnTop: false, // Will be controlled by focus state
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require.resolve('../preload/index.js'),
    },
  })

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show()

    // Don't automatically open dev tools for main window
    // Console window will handle dev tools separately
  })

  // Silence unnecessary Autofill errors in dev tools
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
      event.preventDefault()
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

function createConsoleWindow() {
  const consoleWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'Developer Console - Geppetto',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require.resolve('../preload/index.js'),
    },
  })

  consoleWindow.webContents.on('did-finish-load', () => {
    consoleWindow.show()
    // Open dev tools detached in a separate window
    consoleWindow.webContents.openDevTools({ mode: 'detach' })
  })

  // Register separate route for console window
  registerRoute({
    id: 'console',
    browserWindow: consoleWindow,
    htmlFile: join(__dirname, '../renderer/index.html'),
  })

  return consoleWindow
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
let consoleWindow: BrowserWindow | null = null

app.whenReady().then(async () => {
  // Wait for IPC handlers to be fully set up before creating the window
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setupAccountIpcHandlers
      yield* setupGitHubIpcHandlers
    }).pipe(Effect.provide(MainLayer))
  )

  mainWindow = await makeAppSetup(async () => createMainWindow())

  // Create console window in development mode
  if (process.env.NODE_ENV === 'development') {
    consoleWindow = createConsoleWindow()
  }

  // Track focus state
  let isMainWindowFocused = true

  // Helper function to toggle window focus
  const toggleWindowFocus = () => {
    console.log('[Hotkey] Toggle focus pressed')
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (isMainWindowFocused) {
        // Unfocus: fade out and make click-through
        isMainWindowFocused = false
        mainWindow.setIgnoreMouseEvents(true, { forward: true })
        mainWindow.webContents.send('window:unfocus')
        console.log('[Window] Unfocused - click-through enabled')
      } else {
        // Focus: fade in and restore click handling
        isMainWindowFocused = true
        mainWindow.setIgnoreMouseEvents(false)
        mainWindow.focus()
        mainWindow.webContents.send('window:focus')
        console.log('[Window] Focused - click-through disabled')
      }
    }
  }

  // Register global shortcut to toggle focus (Cmd/Ctrl + Shift + G for Geppetto)
  const toggleShortcut = 'CommandOrControl+Shift+G'
  const registered = globalShortcut.register(toggleShortcut, toggleWindowFocus)

  if (registered) {
    console.log(`[Hotkeys] Successfully registered: ${toggleShortcut} for toggle focus`)
  } else {
    console.error(`[Hotkeys] Failed to register: ${toggleShortcut}`)
  }

  // Register global shortcuts for carousel navigation (only work when focused)
  globalShortcut.register('Left', () => {
    console.log('[Hotkey] Left arrow pressed, focused:', isMainWindowFocused)
    if (mainWindow && !mainWindow.isDestroyed() && isMainWindowFocused) {
      mainWindow.webContents.send('carousel:prev')
    }
  })

  globalShortcut.register('Right', () => {
    console.log('[Hotkey] Right arrow pressed, focused:', isMainWindowFocused)
    if (mainWindow && !mainWindow.isDestroyed() && isMainWindowFocused) {
      mainWindow.webContents.send('carousel:next')
    }
  })

  console.log('[Hotkeys] Registered: Left, Right for carousel navigation')
})

// Handle OAuth callback URLs on macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  console.log('[Protocol] Received URL (macOS):', url)

  if (url.startsWith(`${PROTOCOL_SCHEME}://`)) {
    // Forward to auth service via global event emitter
    app.emit('oauth-callback', url)

    // Bring app to foreground - prefer console window in development
    const targetWindow = consoleWindow || mainWindow
    if (targetWindow) {
      if (targetWindow.isMinimized()) targetWindow.restore()
      targetWindow.focus()
    }
  }
})

// Handle OAuth callback URLs on Windows/Linux
// These platforms use second-instance for protocol handler URLs
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('[Protocol] Second instance detected, quitting...')
  app.quit()
} else {
  console.log('[Protocol] Got the lock, setting up second-instance handler')
  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    console.log('[Protocol] Second instance triggered!')
    console.log('[Protocol] Command line:', commandLine)
    console.log('[Protocol] Working directory:', workingDirectory)

    // Find protocol URL in command line arguments
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`))
    if (url) {
      console.log('[Protocol] Found OAuth callback URL:', url)
      app.emit('oauth-callback', url)
    } else {
      console.log('[Protocol] No OAuth callback URL found in command line')
    }

    // Focus the window - prefer console window in development
    const targetWindow = consoleWindow || mainWindow
    if (targetWindow) {
      if (targetWindow.isMinimized()) targetWindow.restore()
      targetWindow.focus()
    }
  })
}

// Clean up global shortcuts when app quits
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  console.log('[Hotkeys] Unregistered all shortcuts')
})
