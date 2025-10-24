import { Effect, Console, Duration, Deferred, type Scope } from 'effect'
import { BrowserWindow, type Session } from 'electron'
import type { AiProviderType } from '../../../shared/schemas/ai/provider'

/**
 * Configuration for browser-based usage page fetching.
 */
export type BrowserUsagePageConfig = {
  readonly provider: AiProviderType
  readonly url: string
  readonly userAgent: string
  readonly waitForSelector?: string
  readonly maxWaitMs?: number
  readonly preNavigateUrl?: string // Optional URL to visit first before going to the target URL
}

/**
 * Fetch usage page using BrowserWindow to handle client-side rendered pages.
 * This approach actually renders the page and waits for JavaScript to load.
 */
export const fetchUsagePageWithBrowser = (
  accountSession: Session,
  config: BrowserUsagePageConfig
): Effect.Effect<string, Error, Scope.Scope> =>
  Effect.gen(function* () {
    yield* Console.log(
      `[BrowserUsageFetch] Fetching usage page for ${config.provider} using BrowserWindow`
    )

    // Create headless browser window
    const window = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const win = new BrowserWindow({
          width: 1280,
          height: 720,
          show: false, // Headless
          webPreferences: {
            session: accountSession,
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
          },
        })
        return win
      }),
      window =>
        Effect.sync(() => {
          if (!window.isDestroyed()) {
            window.close()
          }
        })
    )

    // Set user agent
    yield* Effect.sync(() => {
      window.webContents.setUserAgent(config.userAgent)
    })

    // Debug: Check if session has cookies
    const cookieCount = yield* Effect.tryPromise({
      try: async () => {
        const cookies = await accountSession.cookies.get({})
        console.log(`[BrowserUsageFetch] Session has ${cookies.length} cookies before loading page`)
        // Log some cookie domains for debugging
        const domains = [...new Set(cookies.map(c => c.domain))].slice(0, 10)
        console.log(`[BrowserUsageFetch] Cookie domains (first 10):`, domains)
        return cookies.length
      },
      catch: () => 0,
    })

    if (cookieCount === 0) {
      yield* Effect.fail(
        new Error('Session has no cookies - authentication may have been lost')
      )
    }

    // Set up page load tracking BEFORE calling loadURL to avoid race conditions
    const pageLoaded = yield* Deferred.make<void, Error>()

    const handleLoadFinish = () => {
      const url = window.webContents.getURL()
      console.log(`[BrowserUsageFetch] Page finished loading: ${url}`)
      Effect.runFork(Deferred.succeed(pageLoaded, undefined))
    }

    const handleLoadFail = (_event: Electron.Event, errorCode: number, errorDescription: string) => {
      console.error(
        `[BrowserUsageFetch] Page load failed: ${errorDescription} (code: ${errorCode})`
      )
      Effect.runFork(
        Deferred.fail(pageLoaded, new Error(`Page load failed: ${errorDescription} (${errorCode})`))
      )
    }

    const handleNavigation = (_event: Electron.Event, url: string) => {
      console.log(`[BrowserUsageFetch] Navigated to: ${url}`)
    }

    // Attach listeners BEFORE loading URL
    window.webContents.once('did-finish-load', handleLoadFinish)
    window.webContents.once('did-fail-load', handleLoadFail)
    window.webContents.on('did-navigate', handleNavigation)
    window.webContents.on('did-navigate-in-page', handleNavigation)

    yield* Console.log(`[BrowserUsageFetch] Loading URL: ${config.url}`)

    // Load the URL (listeners are already attached)
    yield* Effect.tryPromise({
      try: () => window.loadURL(config.url),
      catch: error =>
        new Error(
          `Failed to load URL: ${error instanceof Error ? error.message : String(error)}`
        ),
    })

    yield* Console.log(`[BrowserUsageFetch] Waiting for page to load...`)

    // Wait for page load to complete
    yield* Deferred.await(pageLoaded).pipe(
      Effect.timeoutFail({
        duration: Duration.seconds(30),
        onTimeout: () => new Error('Page load timeout after 30 seconds'),
      })
    )

    yield* Console.log(`[BrowserUsageFetch] Page loaded, waiting for content to render...`)

    // Check if we got redirected to login page
    const finalUrl = yield* Effect.sync(() => window.webContents.getURL())
    if (finalUrl.includes('/login') || finalUrl.includes('/auth') || finalUrl.includes('/signin')) {
      yield* Effect.fail(
        new Error(
          `Redirected to authentication page: ${finalUrl}. Session may not be authenticated.`
        )
      )
    }

    // Wait for dynamic content to load
    // Give JavaScript time to execute and render usage data
    const maxWaitMs = config.maxWaitMs ?? 5000
    const waitForSelector = config.waitForSelector

    if (waitForSelector) {
      // Wait for specific selector to appear
      yield* Console.log(`[BrowserUsageFetch] Waiting for selector: ${waitForSelector}`)

      const selectorReady = yield* Effect.tryPromise({
        try: async () => {
          const startTime = Date.now()
          while (Date.now() - startTime < maxWaitMs) {
            const found = await window.webContents.executeJavaScript(`
              !!document.querySelector('${waitForSelector.replace(/'/g, "\\'")}')
            `)
            if (found) {
              return true
            }
            await new Promise(resolve => setTimeout(resolve, 200))
          }
          return false
        },
        catch: error =>
          new Error(
            `Failed to wait for selector: ${error instanceof Error ? error.message : String(error)}`
          ),
      })

      if (selectorReady) {
        yield* Console.log(`[BrowserUsageFetch] Selector found, extracting content`)
      } else {
        yield* Console.log(
          `[BrowserUsageFetch] WARNING: Selector not found within ${maxWaitMs}ms, proceeding anyway`
        )
      }
    } else {
      // Just wait a fixed amount of time for content to load
      yield* Console.log(`[BrowserUsageFetch] Waiting ${maxWaitMs}ms for content to render...`)
      yield* Effect.sleep(Duration.millis(maxWaitMs))
    }

    // Extract HTML content after page has rendered
    const html = yield* Effect.tryPromise({
      try: () =>
        window.webContents.executeJavaScript(`
        document.documentElement.outerHTML
      `),
      catch: error =>
        new Error(
          `Failed to extract HTML: ${error instanceof Error ? error.message : String(error)}`
        ),
    })

    yield* Console.log(`[BrowserUsageFetch] Extracted HTML (${html.length} characters)`)

    // Cleanup event listeners
    yield* Effect.sync(() => {
      if (!window.isDestroyed()) {
        window.webContents.off('did-navigate', handleNavigation)
        window.webContents.off('did-navigate-in-page', handleNavigation)
      }
    })

    return html
  })
