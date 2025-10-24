import { Console, Effect } from 'effect'
import { AiProviderAuthenticationError } from '../errors'
import type { AiProviderType } from '../../../shared/schemas/ai/provider'
import type {
  UsageBarSnapshot,
  UsagePageEffect,
  UsagePagePort,
  UsagePageSnapshot,
} from './ports'
import { UsagePageError } from './ports'

type ProviderConfig = {
  readonly provider: AiProviderType
  readonly url: string
  readonly parse: (html: string) => UsageBarSnapshot[]
  readonly authRedirectIndicators: ReadonlyArray<RegExp>
  readonly userAgent: string
}

const PROVIDER_CONFIG: ReadonlyArray<ProviderConfig> = [
  {
    provider: 'claude',
    url: 'https://claude.ai/settings/usage',
    parse: parseClaudeUsagePage,
    authRedirectIndicators: [/login/i, /signin/i, /auth/i],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    provider: 'openai',
    url: 'https://chatgpt.com/codex/settings/usage',
    parse: parseOpenAiUsagePage,
    authRedirectIndicators: [/login/i, /auth/i, /signup/i],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    provider: 'cursor',
    url: 'https://cursor.com/dashboard?tab=usage',
    parse: parseCursorUsagePage,
    authRedirectIndicators: [/login/i, /signin/i, /auth/i],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
]

const providerConfigMap = new Map<AiProviderType, ProviderConfig>(
  PROVIDER_CONFIG.map(config => [config.provider, config])
)

function sanitizeText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }
  if (value < 0) {
    return 0
  }
  if (value > 100) {
    return 100
  }
  return value
}

function parseClaudeUsagePage(html: string): UsageBarSnapshot[] {
  const bars: UsageBarSnapshot[] = []

  const cardRegex =
    /<div class="flex flex-col[^"]*">([\s\S]*?)<\/div>\s*<div class="flex[^"]*">\s*<span[^>]*>([\d.]+)\s*%[\s\S]*?(used|remaining)<\/span>/gi

  for (const match of html.matchAll(cardRegex)) {
    const headerBlock = match[1] ?? ''
    const percentValue = clampPercent(Number.parseFloat(match[2] ?? '0'))
    const mode =
      match[3]?.toLowerCase() === 'remaining'
        ? ('remaining' as const)
        : ('used' as const)

    const titleMatch =
      headerBlock.match(
        /<p[^>]*class="[^"]*(?:font-medium|text-text-100|text-base|text-lg)[^"]*"[^>]*>([^<]+)<\/p>/i
      ) ??
      headerBlock.match(
        /<span[^>]*class="[^"]*(?:font-medium|text-text-100|text-base|text-lg)[^"]*"[^>]*>([^<]+)<\/span>/i
      )

    const subtitleMatch = headerBlock.match(
      /<p[^>]*class="[^"]*(?:text-text-500|text-sm|text-xs|text-text-300)[^"]*"[^>]*>([^<]+)<\/p>/i
    )

    const title = sanitizeText(titleMatch?.[1] ?? '')
    if (!title) continue

    const subtitle = subtitleMatch ? sanitizeText(subtitleMatch[1]) : undefined

    bars.push({
      title,
      subtitle,
      percent: percentValue,
      mode,
      detail: subtitle,
    })
  }

  if (bars.length > 0) {
    return dedupeBars(bars)
  }

  const percentRegex =
    /<span[^>]*>([\d.]+)\s*%\s*(?:<\/span>|<\/span>\s*<span[^>]*>)?[\s\S]{0,120}?(used|remaining)/gi
  for (const match of html.matchAll(percentRegex)) {
    const percentValue = clampPercent(Number.parseFloat(match[1] ?? '0'))
    const mode =
      match[2]?.toLowerCase() === 'remaining'
        ? ('remaining' as const)
        : ('used' as const)
    const index = match.index ?? 0
    const contextStart = Math.max(0, index - 600)
    const contextEnd = Math.min(html.length, index + 400)
    const context = html.slice(contextStart, contextEnd)

    const titlePatterns = [
      /<p[^>]*class="[^"]*(?:font-medium|text-text-100|text-lg|text-base)[^"]*"[^>]*>([^<]+)<\/p>/i,
      /<span[^>]*class="[^"]*(?:font-medium|text-text-100|text-lg|text-base)[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<h\d[^>]*>([^<]+)<\/h\d>/i,
      /aria-label="([^"]+Usage[^"]*)"/i,
    ]

    let title = ''
    for (const pattern of titlePatterns) {
      const titleMatch = context.match(pattern)
      if (titleMatch?.[1]) {
        title = sanitizeText(titleMatch[1])
        if (title) break
      }
    }

    if (!title) continue

    const subtitleMatch = context.match(
      /<p[^>]*class="[^"]*(?:text-text-500|text-sm|text-xs|text-text-300)[^"]*"[^>]*>([^<]+)<\/p>/i
    )
    const detailMatch = context.match(/Resets[^<]*(?:<\/span>|<\/p>)/i)

    const subtitle = subtitleMatch ? sanitizeText(subtitleMatch[1]) : undefined
    const detail = detailMatch ? sanitizeText(detailMatch[0]) : subtitle

    bars.push({
      title,
      subtitle,
      percent: percentValue,
      mode,
      detail,
    })
  }

  return dedupeBars(bars)
}

function parseOpenAiUsagePage(html: string): UsageBarSnapshot[] {
  const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/g
  const matches = Array.from(html.matchAll(articleRegex))
  const bars: UsageBarSnapshot[] = []

  for (const match of matches) {
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

    if (!title || !percentText) {
      continue
    }

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

function dedupeBars(bars: UsageBarSnapshot[]): UsageBarSnapshot[] {
  const seen = new Set<string>()
  const result: UsageBarSnapshot[] = []

  for (const bar of bars) {
    const key = `${bar.title}:${bar.detail ?? ''}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(bar)
  }

  return result
}

function renderUsageBar(percentUsed: number): string {
  const segments = 20
  const clamped = clampPercent(percentUsed)
  const filledSegments = Math.round((clamped / 100) * segments)
  const filled = '#'.repeat(filledSegments).padEnd(segments, '-')
  return `[${filled}]`
}

const logUsageSnapshot = (snapshot: UsagePageSnapshot): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Console.log(
      `[UsagePage] ${snapshot.provider} usage metrics (${snapshot.bars.length})`
    )

    for (const bar of snapshot.bars) {
      const usedPercent =
        bar.mode === 'used' ? bar.percent : 100 - clampPercent(bar.percent)
      const statusText =
        bar.mode === 'used'
          ? `${bar.percent.toFixed(1).replace(/\.0$/, '')}% used`
          : `${bar.percent.toFixed(1).replace(/\.0$/, '')}% remaining`
      const suffix =
        bar.mode === 'remaining'
          ? ` (${usedPercent.toFixed(1).replace(/\.0$/, '')}% used)`
          : ''
      const detail = bar.detail ? ` - ${bar.detail}` : ''
      const subtitle = bar.subtitle ? ` - ${bar.subtitle}` : ''

      yield* Console.log(
        `${bar.title}${subtitle}: ${renderUsageBar(usedPercent)} ${statusText}${suffix}${detail}`
      )
    }
  })

export class WebUsagePageAdapter extends Effect.Service<WebUsagePageAdapter>()(
  'WebUsagePageAdapter',
  {
    effect: Effect.sync(() => {
      const fetchUsagePage = (provider: AiProviderType): UsagePageEffect =>
        Effect.gen(function* () {
          const config = providerConfigMap.get(provider)
          if (!config) {
            return yield* Effect.fail(
              new UsagePageError({
                provider,
                reason: 'unsupported',
                message: `No usage page configuration registered for provider: ${provider}`,
              })
            )
          }

          yield* Console.log(
            `[UsagePage] Fetching usage page for ${provider} from ${config.url}`
          )

          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(config.url, {
                headers: {
                  'User-Agent': config.userAgent,
                  Accept: 'text/html,application/xhtml+xml',
                },
              }),
            catch: error =>
              new UsagePageError({
                provider,
                reason: 'request',
                message:
                  error instanceof Error
                    ? `Request failed: ${error.message}`
                    : 'Failed to request usage page',
              }),
          })

          if (response.status === 401 || response.status === 403) {
            return yield* Effect.fail(
              new AiProviderAuthenticationError({
                provider,
                message: 'Authentication required to view usage page.',
              })
            )
          }

          if (
            response.redirected &&
            config.authRedirectIndicators.some(pattern =>
              pattern.test(response.url)
            )
          ) {
            return yield* Effect.fail(
              new AiProviderAuthenticationError({
                provider,
                message: 'Redirected to sign-in page. Please authenticate.',
              })
            )
          }

          const html = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: error =>
              new UsagePageError({
                provider,
                reason: 'request',
                message:
                  error instanceof Error
                    ? `Failed to read usage page response: ${error.message}`
                    : 'Failed to read usage page response',
              }),
          })

          console.log(`[UsagePage] Fetched usage page HTML for ${provider}`)
          console.log(html)

          const bars = config.parse(html)
          if (bars.length === 0) {
            return yield* Effect.fail(
              new UsagePageError({
                provider,
                reason: 'parse',
                message: 'No usage bars could be parsed from the usage page.',
              })
            )
          }

          const snapshot: UsagePageSnapshot = {
            provider,
            fetchedAt: new Date(),
            bars,
          }

          yield* logUsageSnapshot(snapshot)

          return snapshot
        })

      const adapter: UsagePagePort = {
        fetchUsagePage,
      }

      return adapter
    }),
  }
) {}
