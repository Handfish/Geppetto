import { Effect, Console, Schema as S } from 'effect'
import type { Session } from 'electron'
import type { AiProviderType, AiAccountId } from '../../../shared/schemas/ai/provider'
import { ElectronSessionService } from './electron-session-service'
import type { UsagePageSnapshot, UsageBarSnapshot } from '../usage-page/ports'
import { UsagePageError } from '../usage-page/ports'
import { AiProviderAuthenticationError } from '../errors'

/**
 * Provider-specific configuration for fetching usage pages.
 */
type ProviderUsageConfig = {
  readonly provider: AiProviderType
  readonly url: string
  readonly parse: (html: string) => UsageBarSnapshot[]
  readonly authRedirectIndicators: ReadonlyArray<RegExp>
  readonly userAgent: string
}

const PROVIDER_CONFIGS: ReadonlyArray<ProviderUsageConfig> = [
  {
    provider: 'openai',
    url: 'https://chatgpt.com/settings/usage',
    parse: parseOpenAiUsagePage,
    authRedirectIndicators: [/login/i, /auth/i, /signup/i],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    provider: 'claude',
    url: 'https://claude.ai/settings/usage',
    parse: parseClaudeUsagePage,
    authRedirectIndicators: [/login/i, /signin/i, /auth/i],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

  return dedupeBars(bars)
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
    if (!title) continue

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
       */
      const fetchWithSession = (
        accountSession: Session,
        config: ProviderUsageConfig
      ): Effect.Effect<string, UsagePageError | AiProviderAuthenticationError> =>
        Effect.gen(function* () {
          yield* Console.log(
            `[CookieUsagePage] Fetching usage page for ${config.provider} from ${config.url}`
          )

          // Check if session has cookies (is authenticated)
          const hasCookies = yield* sessionService.hasAnyCookies(accountSession).pipe(
            Effect.catchAll(() => Effect.succeed(false))
          )
          if (!hasCookies) {
            return yield* Effect.fail(
              new AiProviderAuthenticationError({
                provider: config.provider,
                message: 'No authentication cookies found. Please sign in again.',
              })
            )
          }

          // Use Electron's session to fetch with cookies
          const html = yield* Effect.tryPromise({
            try: async () => {
              const response = await accountSession.fetch(config.url, {
                headers: {
                  'User-Agent': config.userAgent,
                  Accept: 'text/html,application/xhtml+xml',
                },
              })

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

              return await response.text()
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
      ): Effect.Effect<UsagePageSnapshot, UsagePageError | AiProviderAuthenticationError> =>
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

          const accountSession = yield* sessionService.getSession(provider, identifier)
          const html = yield* fetchWithSession(accountSession, config)

          const bars = config.parse(html)
          if (bars.length === 0) {
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
