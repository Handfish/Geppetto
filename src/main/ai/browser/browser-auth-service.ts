import {
  Effect,
  Deferred,
  type Scope,
  Schedule,
  Duration,
  Console,
  Option,
} from 'effect'
import { BrowserWindow, type Session } from 'electron'
import type { AiProviderType } from '../../../shared/schemas/ai/provider'
import { ElectronSessionService } from './electron-session-service'

/**
 * Configuration for browser-based authentication flow.
 */
export type BrowserAuthConfig = {
  readonly provider: AiProviderType
  readonly loginUrl: string
  readonly successUrlPatterns: ReadonlyArray<RegExp>
  readonly width?: number
  readonly height?: number
  readonly title?: string
}

/**
 * Result of successful browser authentication.
 */
export type BrowserAuthResult = {
  readonly provider: AiProviderType
  readonly identifier: string
  readonly successUrl: string
}

/**
 * Service for managing browser-based authentication flows.
 * Uses Effect.Scope for automatic BrowserWindow cleanup.
 */
export class BrowserAuthService extends Effect.Service<BrowserAuthService>()(
  'BrowserAuthService',
  {
    dependencies: [ElectronSessionService.Default],
    effect: Effect.gen(function* () {
      const sessionService = yield* ElectronSessionService

      /**
       * Create a managed BrowserWindow that automatically closes when scope ends.
       */
      const createManagedWindow = (
        accountSession: Session,
        config: BrowserAuthConfig
      ): Effect.Effect<BrowserWindow, never, Scope.Scope> =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const window = new BrowserWindow({
              width: config.width ?? 800,
              height: config.height ?? 900,
              title: config.title ?? `Sign in to ${config.provider}`,
              webPreferences: {
                session: accountSession,
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
              },
              autoHideMenuBar: true,
              show: false, // Don't show until ready-to-show
            })

            // Show when ready to prevent visual flicker
            window.once('ready-to-show', () => {
              window.show()
            })

            return window
          }),
          window =>
            Effect.sync(() => {
              if (!window.isDestroyed()) {
                window.close()
              }
            })
        )

      /**
       * Monitor browser window navigation and resolve when success URL is reached.
       */
      const monitorNavigation = (
        window: BrowserWindow,
        config: BrowserAuthConfig,
        identifier: string
      ): Effect.Effect<BrowserAuthResult, Error> =>
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<BrowserAuthResult, Error>()

          // Track if window was closed by user and authentication state
          let userClosed = false
          let authenticated = false

          // Inject detection code once page loads
          const injectDetectionCode = async () => {
            try {
              // Wait for page to be ready
              // await window.webContents.executeJavaScript(`
              //   // Detect authentication by checking for common logged-in indicators
              //   (function() {
              //     const checkInterval = setInterval(() => {
              //       // Look for user menu, settings, or other logged-in indicators
              //       const indicators = [
              //         '[data-testid="user-menu"]',
              //         '[aria-label*="user" i]',
              //         '[aria-label*="profile" i]',
              //         '[data-radix-menu-trigger]',
              //         '.user-menu',
              //         '#user-menu'
              //       ];
              //       const isLoggedIn = indicators.some(selector => {
              //         return document.querySelector(selector) !== null;
              //       });
              //       if (isLoggedIn) {
              //         clearInterval(checkInterval);
              //         console.log('[BrowserAuth] Detected successful login');
              //       }
              //     }, 500);
              //     // Clean up after 30 seconds
              //     setTimeout(() => clearInterval(checkInterval), 30000);
              //   })();
              // `)
            } catch (error) {
              // Ignore injection errors - fallback to URL pattern detection
              console.log(
                `[BrowserAuth] Could not inject detection code: ${error instanceof Error ? error.message : String(error)}`
              )
            }
          }

          // Handle successful navigation
          const handleNavigation = (_event: Electron.Event, url: string) => {
            if (config.successUrlPatterns.some(pattern => pattern.test(url))) {
              authenticated = true

              console.log(`[BrowserAuth] Success URL detected: ${url}`)

              Effect.runFork(
                Deferred.succeed(deferred, {
                  provider: config.provider,
                  identifier,
                  successUrl: url,
                })
              )
            }
          }

          // Handle page load completion
          const handleDidFinishLoad = () => {
            const url = window.webContents.getURL()
            console.log(`[BrowserAuth] Page loaded: ${url}`)

            // Inject detection code on each page load
            injectDetectionCode().catch(err => {
              console.error(
                '[BrowserAuth] Failed to inject detection code:',
                err
              )
            })

            // Check if this is a success URL
            if (config.successUrlPatterns.some(pattern => pattern.test(url))) {
              authenticated = true
              Effect.runFork(
                Deferred.succeed(deferred, {
                  provider: config.provider,
                  identifier,
                  successUrl: url,
                })
              )
            }
          }

          // Handle window close
          const handleClose = () => {
            if (!authenticated) {
              userClosed = true
              Effect.runFork(
                Deferred.fail(
                  deferred,
                  new Error(
                    `Authentication window closed by user for ${config.provider}`
                  )
                )
              )
            }
          }

          // Register listeners
          window.webContents.on('did-navigate', handleNavigation)
          window.webContents.on('did-navigate-in-page', handleNavigation)
          window.webContents.on('did-finish-load', handleDidFinishLoad)
          window.on('closed', handleClose)

          // Load initial URL
          yield* Effect.tryPromise({
            try: () => window.loadURL(config.loginUrl),
            catch: error =>
              new Error(
                `Failed to load login URL: ${error instanceof Error ? error.message : String(error)}`
              ),
          })

          yield* Console.log(
            `[BrowserAuth] Opened browser window for ${config.provider} at ${config.loginUrl}`
          )

          // Wait for authentication to complete with timeout (5 minutes max)
          const result = yield* Deferred.await(deferred).pipe(
            Effect.timeoutFail({
              duration: Duration.minutes(5),
              onTimeout: () =>
                new Error(
                  `Authentication timeout after 5 minutes for ${config.provider}`
                ),
            })
          )

          yield* Console.log(
            `[BrowserAuth] Authentication successful for ${config.provider}: ${result.successUrl}`
          )

          // Cleanup listeners
          if (!window.isDestroyed()) {
            window.webContents.off('did-navigate', handleNavigation)
            window.webContents.off('did-navigate-in-page', handleNavigation)
            window.webContents.off('did-finish-load', handleDidFinishLoad)
            window.off('closed', handleClose)

            // Close window after short delay to show success
            yield* Effect.sleep(Duration.millis(1000))
            if (!userClosed && !window.isDestroyed()) {
              window.close()
            }
          }

          return result
        })

      /**
       * Execute browser-based authentication flow.
       * Automatically manages BrowserWindow lifecycle with Scope.
       */
      const authenticate = (
        config: BrowserAuthConfig,
        identifier: string
      ): Effect.Effect<BrowserAuthResult, Error> =>
        Effect.gen(function* () {
          yield* Console.log(
            `[BrowserAuth] Starting authentication for ${config.provider}`
          )

          const accountSession = yield* sessionService.getSession(
            config.provider,
            identifier
          )

          // Create scoped authentication flow
          const result = yield* Effect.scoped(
            Effect.gen(function* () {
              const window = yield* createManagedWindow(accountSession, config)
              return yield* monitorNavigation(window, config, identifier)
            })
          )

          return result
        }).pipe(
          // Retry once if initial attempt fails (e.g., network issues during load)
          Effect.retry(
            Schedule.once.pipe(
              Schedule.compose(Schedule.spaced(Duration.seconds(1)))
            )
          )
        )

      /**
       * Check if an account is authenticated by checking for cookies.
       */
      const isAuthenticated = (
        provider: AiProviderType,
        identifier: string
      ): Effect.Effect<boolean, Error> =>
        Effect.gen(function* () {
          const accountSession = yield* sessionService.getSession(
            provider,
            identifier
          )
          return yield* sessionService.hasAnyCookies(accountSession)
        })

      return {
        authenticate,
        isAuthenticated,
      } as const
    }),
  }
) {}
