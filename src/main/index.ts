import 'dotenv/config'
import { app, BrowserWindow, globalShortcut } from 'electron'
import { join } from 'node:path'
import { Effect, Layer } from 'effect'
import { GitHubAuthService } from './github/auth-service'
import { GitHubApiService } from './github/api-service'
import { GitHubHttpService } from './github/http-service'
import { SecureStoreService } from './github/store-service'
import { VcsAdaptersLayer } from './vcs/adapters-layer'
import { TierService } from './tier/tier-service'
import { AccountContextService } from './account/account-context-service'
import { setupAccountIpcHandlers } from './ipc/account-handlers'
import { registerRoute } from '../lib/electron-router-dom'
import { makeAppSetup } from '../lib/electron-app/factories/app/setup'
import { ProviderRegistryService } from './vcs/provider-registry'
import { VcsProviderService } from './vcs/vcs-provider-service'
import { setupProviderIpcHandlers } from './ipc/provider-handlers'
import { AiAccountContextService } from './ai/account-context-service'
import { AiAdaptersLayer } from './ai/adapters-layer'
import { AiProviderRegistryService } from './ai/registry'
import { AiProviderService } from './ai/ai-provider-service'
import { setupAiProviderIpcHandlers } from './ipc/ai-provider-handlers'
import { setupAiWatcherIpcHandlers } from './ipc/ai-watcher-handlers'
import { ElectronSessionService } from './ai/browser/electron-session-service'
import { BrowserAuthService } from './ai/browser/browser-auth-service'
import { CookieUsagePageAdapter } from './ai/browser/cookie-usage-page-adapter'
import {
  GitCommandService,
  NodeGitCommandRunner,
  RepositoryService,
  CommitGraphService,
  SyncService,
  NodeFileSystemAdapter,
  ProviderFactoryService,
  GitHubProviderAdapter as SourceControlGitHubProviderAdapter,
} from './source-control'
import { setupSourceControlIpcHandlers } from './ipc/source-control-handlers'
import { WorkspaceService } from './workspace/workspace-service'
import { setupWorkspaceIpcHandlers } from './ipc/workspace-handlers'
import { AiWatchersLayer } from './ai-watchers'
import { CoreInfrastructureLayer } from './core-infrastructure-layer'
import { BroadcastService } from './broadcast/broadcast-service'

// Protocol scheme for OAuth callbacks
const PROTOCOL_SCHEME = 'geppetto'

/**
 * FUTURE: Layer Separation Plan (ref: docs/effect_ports_migration_guide.md)
 *
 * Current MainLayer will be decomposed into hierarchical sublayers following
 * the Effectful Ports pattern, enabling:
 * - Port/Adapter separation (interfaces vs implementations)
 * - Hot-swappable adapters for testing and runtime flexibility
 * - Domain-based organization
 * - Cleaner dependency graphs
 *
 * Planned structure:
 *
 * 1. CoreAdaptersLayer - Infrastructure port implementations (bottom layer)
 *    - NodeGitCommandRunner (port: GitCommandRunner)
 *    - NodeFileSystemAdapter (port: FileSystemPort)
 *    - ElectronSessionService (port: SessionPort)
 *    Purpose: OS/platform-specific implementations, easily mockable
 *
 * 2. CoreInfrastructureLayer - Foundation services (depends on CoreAdaptersLayer)
 *    - SecureStoreService
 *    - TierService
 *    - BrowserAuthService
 *    - CookieUsagePageAdapter
 *    Purpose: Cross-cutting concerns used by all domains
 *
 * 3. VcsAdaptersLayer - VCS provider port implementations
 *    - GitHubProviderAdapter (port: VcsProviderPort)
 *    - GitLabProviderAdapter (port: VcsProviderPort)
 *    - BitbucketProviderAdapter (port: VcsProviderPort)
 *    - GiteaProviderAdapter (port: VcsProviderPort)
 *    - SourceControlGitHubProviderAdapter (port: SourceControlProviderPort)
 *    Purpose: Swappable VCS backends, mockable for testing
 *
 * 4. VcsDomainLayer - VCS business logic (depends on VcsAdaptersLayer + CoreInfrastructureLayer)
 *    - GitHubHttpService
 *    - GitHubAuthService
 *    - GitHubApiService
 *    - AccountContextService
 *    - ProviderRegistryService
 *    - VcsProviderService
 *    - ProviderFactoryService
 *    Purpose: VCS domain operations and multi-account management
 *
 * 5. AiAdaptersLayer - AI provider port implementations
 *    - OpenAiBrowserProviderAdapter (port: AiProviderPort)
 *    - ClaudeBrowserProviderAdapter (port: AiProviderPort)
 *    Purpose: Swappable AI backends, mockable for testing
 *
 * 6. AiDomainLayer - AI business logic (depends on AiAdaptersLayer + CoreInfrastructureLayer)
 *    - AiAccountContextService
 *    - AiProviderRegistryService
 *    - AiProviderService
 *    - AiWatchersLayer
 *    Purpose: AI domain operations and session management
 *
 * 7. SourceControlDomainLayer - Git operations (depends on CoreAdaptersLayer + VcsDomainLayer)
 *    - GitCommandService
 *    - RepositoryService
 *    - CommitGraphService
 *    - SyncService
 *    Purpose: Local git repository operations and sync logic
 *
 * 8. WorkspaceDomainLayer - Workspace management (depends on all domain layers)
 *    - WorkspaceService
 *    Purpose: Orchestrates across all domains for workspace state
 *
 * Final composition will be:
 * ```typescript
 * const MainLayer = Layer.mergeAll(
 *   CoreAdaptersLayer,
 *   CoreInfrastructureLayer,
 *   VcsAdaptersLayer,
 *   VcsDomainLayer,
 *   AiAdaptersLayer,
 *   AiDomainLayer,
 *   SourceControlDomainLayer,
 *   WorkspaceDomainLayer
 * )
 * ```
 *
 * Benefits:
 * - Easier testing: Mock entire adapter layers (e.g., MockVcsAdaptersLayer for tests)
 * - Runtime flexibility: Swap adapters via Layer.provide for different environments
 * - Clear boundaries: Ports define contracts, adapters implement, services consume
 * - Parallel loading: Independent adapter layers can initialize concurrently
 * - Better IDE support: Smaller layer scopes improve type inference
 *
 * Migration approach:
 * 1. Identify ports (currently some services act as both port and adapter)
 * 2. Extract adapter implementations as separate Layer.succeed/Layer.effect
 * 3. Convert port interfaces to Effect.Service definitions
 * 4. Update dependent services to use port services via yield*
 * 5. Group layers by domain and dependency order
 * 6. Test each layer in isolation before composing
 */

// Current monolithic layer - TO BE DECOMPOSED
const MainLayer = Layer.mergeAll(
  // [FUTURE: CoreAdaptersLayer]
  NodeGitCommandRunner.Default,           // Adapter: GitCommandRunner port
  NodeFileSystemAdapter.Default,          // Adapter: FileSystemPort

  // [FUTURE: CoreInfrastructureLayer] - NOW USING SHARED REFERENCE! ✅
  CoreInfrastructureLayer,                // ✅ MEMOIZED: All infrastructure services (Browser, Session, Store, Tier)
  BroadcastService.Default,               // Cross-window state synchronization

  // [FUTURE: VcsAdaptersLayer] - NOW IMPLEMENTED! ✅
  // Note: VcsAdaptersLayer is provided to VcsDomainLayer below
  // This ensures adapters are available when domain services need them

  // [FUTURE: VcsDomainLayer] - NOW IMPLEMENTED with proper dependency injection! ✅
  // These services require the VCS adapters, so we provide them via Layer.provide
  Layer.provide(
    Layer.mergeAll(
      ProviderRegistryService.Default,      // Domain: VCS provider registry (captures adapters)
      VcsProviderService.Default,           // Domain: VCS provider orchestration
      ProviderFactoryService.Default,       // Domain: VCS provider factory
    ),
    VcsAdaptersLayer  // Provides all VCS adapters to services above
  ),

  // VCS domain services (these will be needed by adapters, so they're at top level)
  GitHubHttpService.Default,              // Domain: GitHub HTTP client
  GitHubAuthService.Default,              // Domain: GitHub OAuth flow
  GitHubApiService.Default,               // Domain: GitHub API operations
  AccountContextService.Default,          // Domain: Multi-account VCS management
  SourceControlGitHubProviderAdapter.Default, // Adapter: GitHub source control provider

  // AI Provider Domain - Fully implemented with proper dependency injection ✅
  // These services depend on AI provider adapters (OpenAI, Claude, Cursor)
  Layer.provide(
    Layer.mergeAll(
      AiAccountContextService.Default,        // Domain: Multi-account AI management
      AiProviderRegistryService.Default,      // Domain: AI provider registry (captures adapters)
      AiProviderService.Default,              // Domain: AI provider orchestration
    ),
    AiAdaptersLayer  // Provides: OpenAI, Claude, Cursor adapters
  ),

  // AI Watchers Domain - Independent, has its own adapters ✅
  // Does NOT depend on AI provider adapters (OpenAI/Claude/Cursor)
  // Has its own adapters: NodeProcessMonitor, TmuxSessionManager
  AiWatchersLayer,  // Includes: WatcherAdaptersLayer + AiWatcherService

  // [FUTURE: SourceControlDomainLayer]
  GitCommandService.Default,              // Domain: Git command execution
  RepositoryService.Default,              // Domain: Repository management
  CommitGraphService.Default,             // Domain: Commit graph operations
  SyncService.Default,                    // Domain: Repository sync logic

  // [FUTURE: WorkspaceDomainLayer]
  WorkspaceService.Default,               // Domain: Workspace orchestration
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
    if (
      message.includes('Autofill.enable') ||
      message.includes('Autofill.setAddresses')
    ) {
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
  // Wait for IPC handlers to be fully set up before creating the window
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setupAccountIpcHandlers
      yield* setupProviderIpcHandlers
      yield* setupAiProviderIpcHandlers
      yield* setupAiWatcherIpcHandlers
      yield* setupSourceControlIpcHandlers
      yield* setupWorkspaceIpcHandlers
    }).pipe(Effect.provide(MainLayer))
  )

  mainWindow = await makeAppSetup(async () => createMainWindow())

  // Create console window in development mode
  if (process.env.NODE_ENV === 'development') {
    consoleWindow = createConsoleWindow()
  }

  // Track focus state
  let isMainWindowFocused = true

  // Helper functions to manage arrow key shortcuts
  const registerArrowKeys = () => {
    globalShortcut.register('Left', () => {
      console.log('[Hotkey] Left arrow pressed')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('carousel:prev')
      }
    })

    globalShortcut.register('Right', () => {
      console.log('[Hotkey] Right arrow pressed')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('carousel:next')
      }
    })

    console.log('[Hotkeys] Registered: Left, Right for carousel navigation')
  }

  const unregisterArrowKeys = () => {
    globalShortcut.unregister('Left')
    globalShortcut.unregister('Right')
    console.log('[Hotkeys] Unregistered: Left, Right for carousel navigation')
  }

  // Helper function to toggle window focus
  const toggleWindowFocus = () => {
    console.log('[Hotkey] Toggle focus pressed')
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (isMainWindowFocused) {
        // Unfocus: trigger fade out, then hide window to restore focus to previous app
        isMainWindowFocused = false
        mainWindow.setIgnoreMouseEvents(true, { forward: true })
        mainWindow.webContents.send('window:unfocus')
        unregisterArrowKeys()

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
        registerArrowKeys()
        console.log(
          '[Window] Focused - window shown, click-through disabled, arrow keys captured'
        )
      }
    }
  }

  // Register global shortcut to toggle focus (Cmd/Ctrl + Shift + G for Geppetto)
  const toggleShortcut = 'CommandOrControl+Shift+G'
  const registered = globalShortcut.register(toggleShortcut, toggleWindowFocus)

  if (registered) {
    console.log(
      `[Hotkeys] Successfully registered: ${toggleShortcut} for toggle focus`
    )
  } else {
    console.error(`[Hotkeys] Failed to register: ${toggleShortcut}`)
  }

  // Register arrow key shortcuts initially (since we start in focused state)
  registerArrowKeys()
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
