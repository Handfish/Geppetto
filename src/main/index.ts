import 'dotenv/config'
import { app, BrowserWindow, globalShortcut } from 'electron'
import { join } from 'node:path'
import { Effect, Layer } from 'effect'
import { GitHubAuthService } from './github/auth-service'
import { GitHubApiService } from './github/api-service'
import { GitHubHttpService } from './github/http-service'
import { VcsAdaptersLayer } from './vcs/adapters-layer'
import { VcsSourceControlAdaptersLayer } from './vcs/adapters/source-control'
import { AccountContextService } from './account/account-context-service'
import { setupAccountIpcHandlers } from './ipc/account-handlers'
import { registerRoute } from '../lib/electron-router-dom'
import { makeAppSetup } from '../lib/electron-app/factories/app/setup'
import { ProviderRegistryService } from './vcs/provider-registry'
import { VcsProviderService } from './vcs/vcs-provider-service'
import { setupProviderIpcHandlers } from './ipc/provider-handlers'
import { setupGitHubIssueIpcHandlers } from './ipc/github-issue-handlers'
import { AiAccountContextService } from './ai/account-context-service'
import { AiAdaptersLayer } from './ai/adapters-layer'
import { AiProviderRegistryService } from './ai/registry'
import { AiProviderService } from './ai/ai-provider-service'
import { setupAiProviderIpcHandlers } from './ipc/ai-provider-handlers'
import { setupAiWatcherIpcHandlers } from './ipc/ai-watcher-handlers'
import {
  GitCommandService,
  RepositoryService,
  CommitGraphService,
  SyncService,
  SourceControlAdaptersLayer,
} from './source-control'
import { setupSourceControlIpcHandlers } from './ipc/source-control-handlers'
import { WorkspaceDomainLayer } from './workspace/workspace-layer'
import { setupWorkspaceIpcHandlers } from './ipc/workspace-handlers'
import { AiWatchersLayer } from './ai-watchers'
import {
  CoreInfrastructureLayer,
  CoreSecureStoreLayer,
} from "./core-infrastructure-layer"
import { BroadcastService } from './broadcast/broadcast-service'
import { KeyboardLayerManager } from './keyboard/keyboard-layer-manager'
import { setupKeyboardLayerIpcHandlers } from './ipc/keyboard-layer-handlers'

// Protocol scheme for OAuth callbacks
const PROTOCOL_SCHEME = 'geppetto'

// Create shared layer references to ensure single construction (memoization by reference)
const GitHubServicesLayer = Layer.mergeAll(
  GitHubHttpService.Default,
  GitHubAuthService.Default,
  GitHubApiService.Default
)

// Protocol scheme for OAuth callbacks
// VCS adapter layer with dependencies already provided
const VcsSourceControlAdaptersWithDeps = Layer.provide(
  VcsSourceControlAdaptersLayer,
  Layer.mergeAll(GitHubServicesLayer, CoreSecureStoreLayer),
)

/**
 * MainLayer - Application-wide Effect Layer Composition
 *
 * This layer composes all services following Hexagonal Architecture with Effect.
 * Services are organized by domain with proper dependency injection patterns.
 *
 * Architecture Patterns Used:
 * 1. **Single Implementation Ports**: Infrastructure adapters (Git, FileSystem, Process)
 *    - Use direct dependency injection via Layer.mergeAll
 *    - Hot-swappable for testing (mock entire layer)
 *
 * 2. **Multiple Implementation Ports**: Provider adapters (AI, VCS)
 *    - Use registry/factory pattern for dynamic selection
 *    - Multiple active implementations (GitHub + GitLab + Bitbucket)
 *    - Provided via Layer.provide to registry services
 *
 * 3. **Layer Memoization**: Shared infrastructure via CoreInfrastructureLayer
 *    - Single reference ensures services constructed once
 *    - Prevents duplicate initialization
 *
 * For detailed architecture documentation, see:
 * - docs/AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md
 * - docs/SOURCE_CONTROL_HEXAGONAL_ARCHITECTURE.md
 * - docs/AI_WATCHERS_LIFECYCLE.md
 * - docs/VCS_PROVIDER_LIFECYCLE.md
 */
const MainLayer = Layer.mergeAll(
  // ═══════════════════════════════════════════════════════════════════════
  // INFRASTRUCTURE ADAPTERS (Single Implementation Pattern)
  // ═══════════════════════════════════════════════════════════════════════

  // Source Control Infrastructure: Git command execution + File system operations
  SourceControlAdaptersLayer,             // NodeGitCommandRunner, NodeFileSystemAdapter

  // Core Infrastructure: Shared services (memoized for performance)
  CoreInfrastructureLayer,                // Browser, Session, Store, Tier services
  BroadcastService.Default,               // Cross-window state synchronization

  // ═══════════════════════════════════════════════════════════════════════
  // VCS PROVIDER DOMAIN (Multiple Implementation Pattern with Registry)
  // ═══════════════════════════════════════════════════════════════════════

  // VCS Provider Registry + Services (depends on VcsAdaptersLayer)
  Layer.provide(
    Layer.mergeAll(
      ProviderRegistryService.Default,    // Registry: Manages VCS provider adapters
      VcsProviderService.Default,         // Service: VCS provider orchestration
    ),
    VcsAdaptersLayer                      // Adapters: GitHub, GitLab, Bitbucket, Gitea
  ),

  // VCS Domain Services (single reference to avoid duplication)
  GitHubServicesLayer,                    // GitHub HTTP, Auth, API services
  AccountContextService.Default,          // Multi-account VCS management

  // ═══════════════════════════════════════════════════════════════════════
  // AI PROVIDER DOMAIN (Multiple Implementation Pattern with Registry)
  // ═══════════════════════════════════════════════════════════════════════

  // AI Provider Registry + Services (depends on AiAdaptersLayer)
  Layer.provide(
    Layer.mergeAll(
      AiAccountContextService.Default,    // Multi-account AI management
      AiProviderRegistryService.Default,  // Registry: Manages AI provider adapters
      AiProviderService.Default,          // Service: AI provider orchestration
    ),
    AiAdaptersLayer                       // Adapters: OpenAI, Claude, Cursor
  ),

  // ═══════════════════════════════════════════════════════════════════════
  // AI WATCHERS DOMAIN (Single Implementation Pattern)
  // ═══════════════════════════════════════════════════════════════════════

  // AI Watchers (independent domain with own adapters)
  AiWatchersLayer,                        // Process monitoring + Tmux session management

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE CONTROL DOMAIN (Infrastructure Adapters Only)
  // ═══════════════════════════════════════════════════════════════════════
  // Note: Provider operations use ProviderPortFactory (implemented by VCS domain)

  // Source Control Domain Services
  GitCommandService.Default,              // Git command execution
  RepositoryService.Default,              // Repository discovery and management
  CommitGraphService.Default,             // Commit graph operations

  // SyncService needs ProviderPortFactory, so provide it separately
  Layer.provide(
    SyncService.Default,                  // Repository synchronization (uses ProviderPortFactory)
    VcsSourceControlAdaptersWithDeps      // Provides ProviderPortFactory
  ),

  // ═══════════════════════════════════════════════════════════════════════
  // WORKSPACE DOMAIN (Orchestration Layer)
  // ═══════════════════════════════════════════════════════════════════════

  // Workspace orchestration across all domains
  WorkspaceDomainLayer,                   // Workspace configuration and coordination
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
    // Use F12 to toggle if needed
  })

  // F12 to toggle DevTools for main window
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })

  // Silence unnecessary Autofill errors in dev tools (using new API)
  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    // Suppress common Autofill warnings that clutter console
    if (
      message.includes('Autofill.enable') ||
      message.includes('Autofill.setAddresses')
    ) {
      // Just ignore these messages - they're harmless Chrome internals
      return
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
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
      join(__dirname, '..'),
    ])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
}

let mainWindow: BrowserWindow | null = null
let consoleWindow: BrowserWindow | null = null

app.whenReady().then(async () => {
  // Create main window first (needed for KeyboardLayerManager)
  mainWindow = await makeAppSetup(async () => createMainWindow())

  // Create minimal KeyboardLayerManager layer (no dependencies on heavy services)
  const KeyboardLayerManagerLayer = KeyboardLayerManager.Live({ mainWindow })

  // Register keyboard handlers IMMEDIATELY (< 50ms) - don't wait for heavy layers
  await Effect.runPromise(
    setupKeyboardLayerIpcHandlers.pipe(
      Effect.provide(KeyboardLayerManagerLayer)
    )
  )
  console.log('[Main] ✓ Keyboard layer handlers registered (fast path)')

  // Helper: Register arrow key shortcuts for carousel navigation
  const registerArrowKeys = () => {
    // Unregister first to avoid conflicts
    globalShortcut.unregister('Left')
    globalShortcut.unregister('Right')

    globalShortcut.register('Left', () => {
      console.log('[Main] Left arrow → carousel:prev')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('carousel:prev')
      }
    })

    globalShortcut.register('Right', () => {
      console.log('[Main] Right arrow → carousel:next')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('carousel:next')
      }
    })

    console.log('[Main] ✓ Arrow keys registered for carousel navigation')
  }

  // Track focus state
  let isMainWindowFocused = true

  // Helper function to toggle window focus
  const toggleWindowFocus = () => {
    console.log('[Hotkey] Toggle focus pressed')
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (isMainWindowFocused) {
        // Unfocus: trigger fade out, then hide window to restore focus to previous app
        isMainWindowFocused = false
        mainWindow.setIgnoreMouseEvents(true, { forward: true })
        mainWindow.webContents.send('window:unfocus')

        // Unregister arrow keys when window unfocuses (but keep Ctrl+Shift+G active!)
        globalShortcut.unregister('Left')
        globalShortcut.unregister('Right')
        console.log('[Main] ✗ Arrow keys unregistered (window hidden)')

        // Wait for CSS fade animation (500ms) before hiding
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            // Cross-platform window hide that restores focus properly:
            // - Linux: hide() restores focus
            // - Windows: minimize() + hide() restores focus
            // - macOS: app.hide() restores focus (but hides all windows)
            mainWindow.minimize()
            mainWindow.hide()
            if (process.platform === 'darwin') {
              app.hide()
            }
            console.log(
              '[Window] Hidden - focus restored to previous application'
            )
          }
        }, 500)

        console.log('[Window] Unfocused - fading out (will hide in 500ms)')
      } else {
        // Focus: show window, restore from minimized state, fade in
        isMainWindowFocused = true

        // Show and restore window (cross-platform)
        mainWindow.show()
        mainWindow.restore()
        mainWindow.setIgnoreMouseEvents(false)
        mainWindow.focus()
        mainWindow.webContents.send('window:focus')

        // Re-register arrow keys when window is shown
        registerArrowKeys()

        console.log(
          '[Window] Focused - window shown, click-through disabled'
        )
      }
    }
  }

  // Register arrow keys for carousel navigation on startup
  registerArrowKeys()

  // Register global shortcut to toggle focus
  const toggleShortcut = 'CommandOrControl+Shift+G'
  const registered = globalShortcut.register(toggleShortcut, toggleWindowFocus)

  if (registered) {
    console.log(
      `[Hotkeys] Successfully registered: ${toggleShortcut} for toggle focus`
    )
  } else {
    console.error(`[Hotkeys] Failed to register: ${toggleShortcut}`)
  }

  console.log('[Main] Keyboard shortcuts initialized - Ctrl+Shift+G and arrow keys active')

  // Construct full MainLayer with keyboard in background (lazy)
  const MainLayerWithKeyboard = Layer.mergeAll(MainLayer, KeyboardLayerManagerLayer)

  // Register remaining IPC handlers in parallel (non-blocking for keyboard)
  Effect.runPromise(
    Effect.all(
      [
        setupAccountIpcHandlers,
        setupProviderIpcHandlers,
        setupGitHubIssueIpcHandlers,
        setupAiProviderIpcHandlers,
        setupAiWatcherIpcHandlers,
        setupSourceControlIpcHandlers,
        setupWorkspaceIpcHandlers,
      ],
      { concurrency: 'unbounded' }
    ).pipe(Effect.provide(MainLayerWithKeyboard))
  ).catch((error) => {
    console.error('[Main] Failed to setup IPC handlers:', error)
  })
  console.log('[Main] ⏳ Other IPC handlers registering in background...')

  // Create console window in development mode
  if (process.env.NODE_ENV === 'development') {
    consoleWindow = createConsoleWindow()
  }
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
