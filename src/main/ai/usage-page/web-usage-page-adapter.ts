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
  const cardRegex =
    /<div class="flex flex-col gap-1">([\s\S]*?)<\/div>\s*<div class="flex items-center gap-3[\s\S]*?<span class="text-text-300[^>]*">([\d.]+)%\s*(used|remaining)<\/span>/g

  const matches = Array.from(html.matchAll(cardRegex))
  const bars: UsageBarSnapshot[] = []

  for (const match of matches) {
    const headerBlock = match[1] ?? ''
    const percentValue = clampPercent(Number.parseFloat(match[2] ?? '0'))
    const modeRaw =
      match[3]?.toLowerCase() === 'remaining' ? 'remaining' : 'used'

    const titleMatch = headerBlock.match(
      /<p class="font-medium text-text-100">([^<]+)<\/p>/
    )
    const subtitleMatch = headerBlock.match(
      /<p class="text-text-500[^>]*">([^<]+)<\/p>/
    )

    const title = sanitizeText(titleMatch?.[1] ?? '')
    if (!title) {
      continue
    }

    const subtitle = subtitleMatch ? sanitizeText(subtitleMatch[1]) : undefined

    bars.push({
      title,
      subtitle,
      percent: percentValue,
      mode: modeRaw,
      detail: subtitle,
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
