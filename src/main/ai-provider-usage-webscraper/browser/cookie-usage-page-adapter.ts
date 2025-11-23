import { Effect, Console, Schema as S } from 'effect'
import type { Session } from 'electron'
import type {
  AiProviderType,
  AiAccountId,
} from '../../../shared/schemas/ai/provider'
import { ElectronSessionService } from './electron-session-service'
import type { UsagePageSnapshot, UsageBarSnapshot } from '../usage-page/types'
import { UsagePageError } from '../usage-page/types'
import { AiProviderAuthenticationError } from '../errors'
import { fetchUsagePageWithBrowser } from './browser-usage-page-fetcher'

/**
 * Provider-specific configuration for fetching usage pages.
 */
type ProviderUsageConfig = {
  readonly provider: AiProviderType
  readonly url: string
  readonly parse: (html: string) => UsageBarSnapshot[]
  readonly authRedirectIndicators: ReadonlyArray<RegExp>
  readonly userAgent: string
  readonly useBrowserFetch?: boolean // Use BrowserWindow for client-side rendered pages
  readonly waitForSelector?: string // CSS selector to wait for before extracting HTML
  readonly maxWaitMs?: number // Max time to wait for content to render
}

const PROVIDER_CONFIGS: ReadonlyArray<ProviderUsageConfig> = [
  {
    provider: 'openai',
    url: 'https://chatgpt.com/codex/settings/usage',
    parse: parseOpenAiUsagePage,
    authRedirectIndicators: [/login/i, /auth/i, /signup/i],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    useBrowserFetch: true, // OpenAI's usage page is client-side rendered
    waitForSelector: 'article, [data-testid="usage"], .usage-card',
    maxWaitMs: 8000,
  },
  {
    provider: 'claude',
    url: 'https://claude.ai/settings/usage',
    parse: parseClaudeUsagePage,
    authRedirectIndicators: [/login/i, /signin/i, /auth/i],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    useBrowserFetch: true, // Claude's usage page is client-side rendered
    waitForSelector:
      'section, [role="main"], .usage-card, [data-testid="usage"]', // Wait for content sections to load
    maxWaitMs: 8000,
  },
  {
    provider: 'cursor',
    url: 'https://cursor.com/dashboard?tab=usage',
    parse: parseCursorUsagePage,
    authRedirectIndicators: [/login/i, /signin/i, /auth/i],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    useBrowserFetch: true, // Cursor's usage page is likely client-side rendered
    waitForSelector:
      'section, [role="main"], .usage-card, [data-testid="usage"], .dashboard-content',
    maxWaitMs: 8000,
  },
]

const providerConfigMap = new Map<AiProviderType, ProviderUsageConfig>(
  PROVIDER_CONFIGS.map(config => [config.provider, config])
)

// Utility functions for parsing HTML
function sanitizeText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function dedupeBars(bars: UsageBarSnapshot[]): UsageBarSnapshot[] {
  const seen = new Set<string>()
  const result: UsageBarSnapshot[] = []

  for (const bar of bars) {
    const key = `${bar.title}:${bar.detail ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(bar)
  }

  return result
}

function parseOpenAiUsagePage(html: string): UsageBarSnapshot[] {
  const bars: UsageBarSnapshot[] = []

  // Try multiple parsing strategies for different OpenAI page versions

  // Strategy 1: Original article-based parser (legacy)
  const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/g
  const articleMatches = Array.from(html.matchAll(articleRegex))

  for (const match of articleMatches) {
    const body = match[1] ?? ''

    const titleMatch = body.match(
      /<p class="text-token-text-tertiary text-sm font-medium">([^<]+)<\/p>/
    )
    const percentMatch = body.match(
      /<span class="text-2xl font-semibold">([\d.]+)%<\/span>/
    )
    const modeMatch = body.match(
      /<span class="text-base font-normal">([^<]+)<\/span>/
    )
    const detailMatch = body.match(/<span>Resets[^<]*<\/span>/)

    const title = sanitizeText(titleMatch?.[1] ?? '')
    const percentText = sanitizeText(percentMatch?.[1] ?? '')
    const modeText = sanitizeText(modeMatch?.[1] ?? '').toLowerCase()
    const detail = detailMatch ? sanitizeText(detailMatch[0]) : undefined

    if (!title || !percentText) continue

    const percentValue = clampPercent(Number.parseFloat(percentText))
    const mode: 'used' | 'remaining' =
      modeText.includes('used') && !modeText.includes('remaining')
        ? 'used'
        : 'remaining'

    bars.push({
      title,
      percent: percentValue,
      mode,
      detail,
    })
  }

  // Strategy 2: Look for any percentage patterns with context (more flexible)
  if (bars.length === 0) {
    // Match percentage followed by "used" or "remaining"
    const flexiblePattern =
      /([\d.]+)%\s*(?:<[^>]*>)?(?:(?:of|used|remaining)[^<]*)/gi
    const percentMatches = Array.from(html.matchAll(flexiblePattern))

    for (const match of percentMatches) {
      const percentText = match[1]
      const context = match[0].toLowerCase()

      if (!percentText) continue

      // Try to find a title nearby (look backwards in HTML)
      const matchIndex = match.index ?? 0
      const before = html.substring(Math.max(0, matchIndex - 500), matchIndex)

      // Look for common title patterns
      const titlePatterns = [
        /<p[^>]*class="[^"]*(?:font-medium|title|heading)[^"]*"[^>]*>([^<]+)<\/p>/,
        /<h\d[^>]*>([^<]+)<\/h\d>/,
        /<span[^>]*class="[^"]*(?:font-medium|font-semibold)[^"]*"[^>]*>([^<]+)<\/span>/,
      ]

      let title = ''
      for (const pattern of titlePatterns) {
        const titleMatch = before.match(pattern)
        if (titleMatch?.[1]) {
          title = sanitizeText(titleMatch[1])
          break
        }
      }

      if (!title) {
        // Fallback: extract any text that looks like a title (e.g., "GPT-4", "GPT-3.5", etc.)
        const fallbackTitle = before.match(
          /(?:GPT-?[\d.]+|Claude|Messages?|Tokens?|Requests?)/i
        )
        title = fallbackTitle ? sanitizeText(fallbackTitle[0]) : 'Usage'
      }

      const percentValue = clampPercent(Number.parseFloat(percentText))
      const mode: 'used' | 'remaining' = context.includes('remaining')
        ? 'remaining'
        : 'used'

      bars.push({
        title,
        percent: percentValue,
        mode,
      })
    }
  }

  // Strategy 3: Look for JSON-LD or data attributes (if OpenAI embeds structured data)
  if (bars.length === 0) {
    const jsonLdMatch = html.match(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i
    )
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1] ?? '{}')
        // If OpenAI embeds usage data in JSON-LD, parse it here
        console.log('[CookieUsagePage] Found JSON-LD data:', data)
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Look for data- attributes that might contain usage info
    const dataUsageMatch = html.match(/data-usage="([^"]+)"/i)
    if (dataUsageMatch) {
      try {
        const usageData = JSON.parse(dataUsageMatch[1] ?? '{}')
        console.log('[CookieUsagePage] Found data-usage attribute:', usageData)
      } catch {
        // Ignore JSON parse errors
      }
    }
  }

  return dedupeBars(bars)
}

function parseClaudeUsagePage(html: string): UsageBarSnapshot[] {
  const bars: UsageBarSnapshot[] = []

  // Strategy 1: Look for percentage with "left" or "remaining" keywords
  // Claude uses patterns like: <p class="...text-right">98% left</p>
  const percentRegex =
    /<p[^>]*class="[^"]*text-text-400[^"]*text-right[^"]*"[^>]*>([\d.]+)%\s*(left|remaining|used)<\/p>/gi

  const percentMatches = Array.from(html.matchAll(percentRegex))
  console.log(`[ClaudeParser] Found ${percentMatches.length} percentage matches`)

  for (const match of percentMatches) {
    const percentValue = clampPercent(Number.parseFloat(match[1] ?? '0'))
    const keyword = (match[2] ?? '').toLowerCase()

    console.log(`[ClaudeParser] Processing match: ${percentValue}% ${keyword}`)

    // "left" and "remaining" both mean remaining
    const mode: 'used' | 'remaining' =
      keyword === 'used' ? 'used' : 'remaining'

    // Look backwards to find the title and detail
    // Increased context window to handle deeply nested structures
    const index = match.index ?? 0
    const contextStart = Math.max(0, index - 1500)
    const context = html.slice(contextStart, index)

    // Find title with more flexible patterns
    // Try multiple patterns to handle different class orderings
    const titlePatterns = [
      // Exact pattern: font-base text-text-100
      /<p[^>]*class="[^"]*font-base[^"]*text-text-100[^"]*"[^>]*>([^<]+)<\/p>/i,
      // Reversed: text-text-100 font-base
      /<p[^>]*class="[^"]*text-text-100[^"]*font-base[^"]*"[^>]*>([^<]+)<\/p>/i,
      // Just text-text-100 (more permissive)
      /<p[^>]*class="[^"]*text-text-100[^"]*"[^>]*>([^<]+)<\/p>/i,
      // Any <p> with text-text-100 or font-medium
      /<p[^>]*class="[^"]*(?:text-text-100|font-medium)[^"]*"[^>]*>([^<]+)<\/p>/i,
    ]

    let title = ''
    let titleMatch: RegExpMatchArray | null = null
    for (const pattern of titlePatterns) {
      titleMatch = context.match(pattern)
      if (titleMatch?.[1]) {
        title = sanitizeText(titleMatch[1])
        console.log(`[ClaudeParser] Found title with pattern ${pattern}: "${title}"`)
        if (title) break
      }
    }

    if (!title) {
      console.log(`[ClaudeParser] WARNING: No title found for ${percentValue}% ${keyword}`)
      console.log(`[ClaudeParser] Context (last 500 chars): ${context.slice(-500)}`)

      // Try to find ANY <p> tag with text in the context
      const anyPTag = context.match(/<p[^>]*>([^<]+)<\/p>/gi)
      if (anyPTag) {
        console.log(`[ClaudeParser] All <p> tags found in context:`, anyPTag.slice(-5))
      }
      continue
    }

    // Find detail/subtitle: <p class="...text-text-400 whitespace-nowrap">Resets in...</p>
    // Look for the one that has "Resets" or comes right after the title
    const detailMatches = Array.from(
      context.matchAll(
        /<p[^>]*class="[^"]*(?:font-base[^"]*)?text-text-400[^"]*whitespace-nowrap[^"]*"[^>]*>([^<]+)<\/p>/gi
      )
    )

    console.log(`[ClaudeParser] Found ${detailMatches.length} detail matches for "${title}"`)

    // Prefer the one with "Resets" or the last one found
    let detail: string | undefined
    for (const detailMatch of detailMatches) {
      const detailText = sanitizeText(detailMatch[1] ?? '')
      if (detailText.toLowerCase().includes('resets') || detailText.toLowerCase().includes('reset')) {
        detail = detailText
        console.log(`[ClaudeParser] Found reset detail: "${detail}"`)
        break
      }
    }

    // If no "Resets" found, use the last match
    if (!detail && detailMatches.length > 0) {
      const lastMatch = detailMatches[detailMatches.length - 1]
      if (lastMatch?.[1]) {
        detail = sanitizeText(lastMatch[1])
        console.log(`[ClaudeParser] Using last detail match: "${detail}"`)
      }
    }

    console.log(`[ClaudeParser] Adding bar: ${title} - ${percentValue}% ${mode} - ${detail ?? 'no detail'}`)

    bars.push({
      title,
      percent: percentValue,
      mode,
      detail,
    })
  }

  if (bars.length > 0) {
    return dedupeBars(bars)
  }

  // Strategy 2: Fallback - look for any percentage patterns with flexible keywords
  const fallbackRegex = /([\d.]+)%\s*(?:left|remaining|used)/gi

  for (const match of html.matchAll(fallbackRegex)) {
    const percentValue = clampPercent(Number.parseFloat(match[1] ?? '0'))
    const context = match[0].toLowerCase()

    const mode: 'used' | 'remaining' =
      context.includes('used') ? 'used' : 'remaining'

    // Try to find a title nearby (look backwards in HTML)
    const matchIndex = match.index ?? 0
    const before = html.substring(Math.max(0, matchIndex - 1500), matchIndex)

    const titlePatterns = [
      /<p[^>]*class="[^"]*(?:font-medium|text-text-100|font-large-bold)[^"]*"[^>]*>([^<]+)<\/p>/i,
      /<h\d[^>]*class="[^"]*font-large-bold[^"]*"[^>]*>([^<]+)<\/h\d>/i,
      /<span[^>]*class="[^"]*(?:font-medium|text-text-100)[^"]*"[^>]*>([^<]+)<\/span>/i,
    ]

    let title = ''
    for (const pattern of titlePatterns) {
      const titleMatch = before.match(pattern)
      if (titleMatch?.[1]) {
        title = sanitizeText(titleMatch[1])
        if (title) break
      }
    }

    if (!title) continue

    const detailMatch = before.match(/Resets[^<]*(?:<\/span>|<\/p>)/i)
    const detail = detailMatch ? sanitizeText(detailMatch[0]) : undefined

    bars.push({
      title,
      percent: percentValue,
      mode,
      detail,
    })
  }

  return dedupeBars(bars)
}

function parseCursorUsagePage(html: string): UsageBarSnapshot[] {
  const bars: UsageBarSnapshot[] = []

  // Strategy 1: Look for usage cards with percentage indicators
  // Cursor likely uses a similar card-based layout to other providers
  const cardRegex = /<div[^>]*class="[^"]*usage[^"]*"[^>]*>([\s\S]*?)<\/div>/gi

  for (const match of html.matchAll(cardRegex)) {
    const cardContent = match[1] ?? ''

    // Look for percentage patterns
    const percentMatch = cardContent.match(/(\d+(?:\.\d+)?)%/)
    const titleMatch = cardContent.match(
      /<[^>]*class="[^"]*(?:title|heading|name)[^"]*"[^>]*>([^<]+)<\/[^>]*>/i
    )
    const subtitleMatch = cardContent.match(
      /<[^>]*class="[^"]*(?:subtitle|description)[^"]*"[^>]*>([^<]+)<\/[^>]*>/i
    )

    if (percentMatch && titleMatch) {
      const title = sanitizeText(titleMatch[1])
      const subtitle = subtitleMatch
        ? sanitizeText(subtitleMatch[1])
        : undefined
      const percentValue = clampPercent(Number.parseFloat(percentMatch[1]))

      // Determine if it's used or remaining based on context
      const mode: 'used' | 'remaining' = cardContent
        .toLowerCase()
        .includes('remaining')
        ? 'remaining'
        : 'used'

      bars.push({
        title,
        subtitle,
        percent: percentValue,
        mode,
        detail: subtitle,
      })
    }
  }

  if (bars.length > 0) {
    return dedupeBars(bars)
  }

  // Strategy 2: Look for any percentage patterns with context
  const percentRegex =
    /(\d+(?:\.\d+)?)%\s*(?:<[^>]*>)?(?:(?:of|used|remaining)[^<]*)/gi
  const percentMatches = Array.from(html.matchAll(percentRegex))

  for (const match of percentMatches) {
    const percentText = match[1]
    const context = match[0].toLowerCase()

    if (!percentText) continue

    // Try to find a title nearby (look backwards in HTML)
    const matchIndex = match.index ?? 0
    const before = html.substring(Math.max(0, matchIndex - 500), matchIndex)

    // Look for common title patterns
    const titlePatterns = [
      /<[^>]*class="[^"]*(?:title|heading|name|label)[^"]*"[^>]*>([^<]+)<\/[^>]*>/i,
      /<h\d[^>]*>([^<]+)<\/h\d>/i,
      /<span[^>]*class="[^"]*(?:font-medium|font-semibold)[^"]*"[^>]*>([^<]+)<\/span>/i,
    ]

    let title = ''
    for (const pattern of titlePatterns) {
      const titleMatch = before.match(pattern)
      if (titleMatch?.[1]) {
        title = sanitizeText(titleMatch[1])
        break
      }
    }

    if (!title) {
      // Fallback: extract any text that looks like a title
      const fallbackTitle = before.match(
        /(?:Cursor|AI|Usage|Requests?|Tokens?|Messages?)/i
      )
      title = fallbackTitle ? sanitizeText(fallbackTitle[0]) : 'Usage'
    }

    const percentValue = clampPercent(Number.parseFloat(percentText))
    const mode: 'used' | 'remaining' = context.includes('remaining')
      ? 'remaining'
      : 'used'

    bars.push({
      title,
      percent: percentValue,
      mode,
    })
  }

  return dedupeBars(bars)
}

/**
 * Adapter for fetching usage pages using Electron sessions with cookies.
 * This replaces WebUsagePageAdapter which used unauthenticated fetch.
 */
export class CookieUsagePageAdapter extends Effect.Service<CookieUsagePageAdapter>()(
  'CookieUsagePageAdapter',
  {
    dependencies: [ElectronSessionService.Default],
    effect: Effect.gen(function* () {
      const sessionService = yield* ElectronSessionService

      /**
       * Fetch usage page HTML using Electron session's cookies.
       * For client-side rendered apps, this may need to wait for JS to load.
       */
      const fetchWithSession = (
        accountSession: Session,
        config: ProviderUsageConfig
      ): Effect.Effect<
        string,
        UsagePageError | AiProviderAuthenticationError
      > =>
        Effect.gen(function* () {
          yield* Console.log(
            `[CookieUsagePage] Fetching usage page for ${config.provider} from ${config.url}`
          )

          // Check if session has cookies (is authenticated)
          yield* Console.log(
            `[CookieUsagePage] Checking for cookies in session...`
          )
          const hasCookies = yield* sessionService
            .hasAnyCookies(accountSession)
            .pipe(Effect.catchAll(() => Effect.succeed(false)))
          yield* Console.log(
            `[CookieUsagePage] Session has cookies: ${hasCookies}`
          )
          if (!hasCookies) {
            yield* Console.log(
              `[CookieUsagePage] No cookies found, failing with authentication error`
            )
            return yield* Effect.fail(
              new AiProviderAuthenticationError({
                provider: config.provider,
                message:
                  'No authentication cookies found. Please sign in again.',
              })
            )
          }

          // Use Electron's session to fetch with cookies
          const html = yield* Effect.tryPromise({
            try: async () => {
              const response = await accountSession.fetch(config.url, {
                headers: {
                  'User-Agent': config.userAgent,
                  Accept:
                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9',
                  'Cache-Control': 'no-cache',
                  Pragma: 'no-cache',
                },
              })

              console.log(
                `[CookieUsagePage] Response status: ${response.status}`
              )
              console.log(`[CookieUsagePage] Response URL: ${response.url}`)
              console.log(
                `[CookieUsagePage] Response redirected: ${response.redirected}`
              )

              if (response.status === 401 || response.status === 403) {
                throw new Error('Authentication required')
              }

              // Check for auth redirects
              if (
                response.redirected &&
                config.authRedirectIndicators.some(pattern =>
                  pattern.test(response.url)
                )
              ) {
                throw new Error('Redirected to sign-in page')
              }

              const htmlContent = await response.text()

              // Check if we got a minimal HTML page (likely client-side rendered)
              const isMinimalHtml =
                htmlContent.length < 5000 &&
                htmlContent.includes('<div id="root">') &&
                !htmlContent.includes('article')

              if (isMinimalHtml) {
                console.log(
                  `[CookieUsagePage] WARNING: Received minimal HTML (${htmlContent.length} chars), page may be client-side rendered`
                )
              }

              return htmlContent
            },
            catch: error => {
              if (
                error instanceof Error &&
                (error.message.includes('Authentication required') ||
                  error.message.includes('Redirected to sign-in'))
              ) {
                return new AiProviderAuthenticationError({
                  provider: config.provider,
                  message: 'Authentication required. Please sign in again.',
                }) as AiProviderAuthenticationError | UsagePageError
              }

              return new UsagePageError({
                provider: config.provider,
                reason: 'request',
                message:
                  error instanceof Error
                    ? `Failed to fetch usage page: ${error.message}`
                    : 'Failed to fetch usage page',
              }) as AiProviderAuthenticationError | UsagePageError
            },
          })

          return html
        })

      /**
       * Fetch and parse usage page for a specific account.
       */
      const fetchUsagePage = (
        provider: AiProviderType,
        accountId: AiAccountId
      ): Effect.Effect<
        UsagePageSnapshot,
        UsagePageError | AiProviderAuthenticationError
      > =>
        Effect.gen(function* () {
          const config = providerConfigMap.get(provider)
          if (!config) {
            return yield* Effect.fail(
              new UsagePageError({
                provider,
                reason: 'unsupported',
                message: `No usage page configuration for provider: ${provider}`,
              })
            )
          }

          // Parse account ID to get identifier
          const parts = accountId.split(':')
          const identifier = parts[1] ?? 'default'

          const accountSession = yield* sessionService.getSession(
            provider,
            identifier
          )

          // Choose fetching strategy based on config
          const html = yield* config.useBrowserFetch
            ? // Use BrowserWindow for client-side rendered pages
              Effect.scoped(
                fetchUsagePageWithBrowser(accountSession, {
                  provider: config.provider,
                  url: config.url,
                  userAgent: config.userAgent,
                  waitForSelector: config.waitForSelector,
                  maxWaitMs: config.maxWaitMs,
                }).pipe(
                  Effect.mapError(
                    error =>
                      new UsagePageError({
                        provider,
                        reason: 'request',
                        message: `Browser fetch failed: ${error.message}`,
                      }) as UsagePageError | AiProviderAuthenticationError
                  )
                )
              )
            : // Use regular session.fetch for server-side rendered pages
              fetchWithSession(accountSession, config)

          // Debug: Log HTML snippet for debugging parser issues
          yield* Console.log(
            `[CookieUsagePage] Fetched HTML length: ${html.length} characters`
          )
          // Log first 1000 chars to see structure
          yield* Console.log(
            `[CookieUsagePage] HTML snippet (first 1000 chars): ${html.substring(0, 1000)}`
          )
          // Look for article tags
          const articleCount = (html.match(/<article/g) || []).length
          yield* Console.log(
            `[CookieUsagePage] Found ${articleCount} <article> tags in HTML`
          )

          const bars = config.parse(html)
          if (bars.length === 0) {
            // Enhanced error with more debugging info
            yield* Console.error(
              `[CookieUsagePage] Parser failed to find any usage bars. HTML length: ${html.length}, Article tags: ${articleCount}`
            )

            // Save HTML to file for debugging (in development)
            if (process.env.NODE_ENV === 'development') {
              yield* Effect.tryPromise({
                try: async () => {
                  // const fs = await import('fs/promises')
                  // const path = await import('path')
                  // const debugPath = path.join(
                  //   process.cwd(),
                  //   `debug-${provider}-usage-page-${Date.now()}.html`
                  // )
                  // await fs.writeFile(debugPath, html, 'utf-8')
                  // console.log(
                  //   `[CookieUsagePage] Saved HTML to ${debugPath} for debugging`
                  // )
                },
                catch: () => undefined,
              }).pipe(Effect.catchAll(() => Effect.void))
            }

            return yield* Effect.fail(
              new UsagePageError({
                provider,
                reason: 'parse',
                message: 'No usage bars found in usage page.',
              })
            )
          }

          yield* Console.log(
            `[CookieUsagePage] Successfully parsed ${bars.length} usage bars for ${provider}`
          )

          const snapshot: UsagePageSnapshot = {
            provider,
            fetchedAt: new Date(),
            bars,
          }

          return snapshot
        })

      return {
        fetchUsagePage,
      } as const
    }),
  }
) {}
