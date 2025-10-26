import { shell, app } from 'electron'
import { Effect, Redacted, Duration, Option } from 'effect'
import { URL } from 'url'
import { GitHubAuthError, GitHubAuthTimeout } from './errors'
import { GitHubHttpService } from './http-service'
import { SecureStoreService } from './store-service'
import { AccountContextService } from '../account/account-context-service'
import type { AccountId } from '../../shared/schemas/account-context'

const PROTOCOL_SCHEME = 'geppetto'

// Augment Electron's app with custom oauth-callback event
interface OAuthApp {
  on(event: 'oauth-callback', listener: (url: string) => void): this
  removeListener(event: 'oauth-callback', listener: (url: string) => void): this
}

// Global flag to prevent concurrent sign-in attempts
let isSignInInProgress = false

export class GitHubAuthService extends Effect.Service<GitHubAuthService>()(
  'GitHubAuthService',
  {
    dependencies: [
      GitHubHttpService.Default,
      SecureStoreService.Default,
      AccountContextService.Default,
    ],
    effect: Effect.gen(function* () {
      const httpService = yield* GitHubHttpService
      const storeService = yield* SecureStoreService
      const accountService = yield* AccountContextService

      const generateRandomState = () =>
        Math.random().toString(36).substring(2, 15)
      const clientId = process.env.GITHUB_CLIENT_ID || 'your-client-id'
      const redirectUri = `${PROTOCOL_SCHEME}://auth/callback`

      return {
        startAuthFlow: Effect.gen(function* () {
          // Prevent concurrent sign-in attempts
          if (isSignInInProgress) {
            console.log('[Auth] Sign-in already in progress, rejecting concurrent attempt')
            return yield* Effect.fail(
              new GitHubAuthError({
                message: 'Sign-in already in progress',
              })
            )
          }

          isSignInInProgress = true
          console.log('[Auth] Starting GitHub OAuth flow')
          console.log('[Auth] Client ID:', clientId)
          console.log('[Auth] Redirect URI:', redirectUri)

          const authUrl = new URL('https://github.com/login/oauth/authorize')
          authUrl.searchParams.append('client_id', clientId)
          authUrl.searchParams.append('redirect_uri', redirectUri)
          authUrl.searchParams.append('scope', 'repo user read:org')
          authUrl.searchParams.append('state', generateRandomState())

          console.log('[Auth] Opening browser to:', authUrl.toString())
          yield* Effect.sync(() => shell.openExternal(authUrl.toString()))

          // Wait for OAuth callback via protocol handler (with 5 minute timeout)
          console.log('[Auth] Setting up oauth-callback listener...')
          const code = yield* Effect.async<string, GitHubAuthError>(resume => {
            let hasResolved = false

            // Add timeout to prevent infinite waiting
            const timeoutId = setTimeout(() => {
              if (!hasResolved) {
                console.error('[Auth] OAuth callback timeout (5 minutes)')
                hasResolved = true
                ;(app as unknown as OAuthApp).removeListener(
                  'oauth-callback',
                  handleCallback
                )
                resume(
                  Effect.fail(
                    new GitHubAuthError({
                      message: 'OAuth callback timeout - no response received within 5 minutes',
                    })
                  )
                )
              }
            }, 5 * 60 * 1000) // 5 minutes

            const handleCallback = (callbackUrl: string) => {
              console.log('[Auth] handleCallback called with:', callbackUrl)
              if (hasResolved) {
                console.log('[Auth] Ignoring duplicate callback')
                return
              }

              try {
                const url = new URL(callbackUrl)
                console.log(
                  '[Auth] Protocol callback received:',
                  url.toString()
                )

                // Validate protocol and path
                if (
                  url.protocol !== `${PROTOCOL_SCHEME}:` ||
                  url.hostname !== 'auth'
                ) {
                  console.log('[Auth] Invalid callback URL format')
                  return
                }

                const authCode = url.searchParams.get('code')
                const error = url.searchParams.get('error')

                if (error) {
                  console.log('[Auth] OAuth error:', error)
                  hasResolved = true
                  clearTimeout(timeoutId)
                  ;(app as unknown as OAuthApp).removeListener(
                    'oauth-callback',
                    handleCallback
                  )
                  resume(
                    Effect.fail(
                      new GitHubAuthError({
                        message: `GitHub OAuth error: ${error}`,
                      })
                    )
                  )
                  return
                }

                if (authCode) {
                  console.log('[Auth] Authorization code received:', authCode)
                  hasResolved = true
                  clearTimeout(timeoutId)
                  ;(app as unknown as OAuthApp).removeListener(
                    'oauth-callback',
                    handleCallback
                  )
                  console.log('[Auth] About to call resume with Effect.succeed')
                  resume(Effect.succeed(authCode))
                  console.log('[Auth] Resume called successfully')
                  return
                }

                console.log('[Auth] No code or error in callback URL')
              } catch (err) {
                console.error('[Auth] Failed to parse callback URL:', err)
              }
            }

            console.log('[Auth] Registering oauth-callback event listener')
            ;(app as unknown as OAuthApp).on('oauth-callback', handleCallback)
            console.log(
              '[Auth] Event listener registered, waiting for callback...'
            )

            // Cleanup function
            return Effect.sync(() => {
              console.log('[Auth] Cleaning up oauth-callback listener')
              clearTimeout(timeoutId)
              ;(app as unknown as OAuthApp).removeListener(
                'oauth-callback',
                handleCallback
              )
            })
          })

          console.log(
            '[Auth] Code extracted. Type:',
            typeof code,
            'Value:',
            code
          )
          if (!code) {
            console.error('[Auth] Code is falsy!', code)
            return yield* Effect.fail(
              new GitHubAuthError({
                message: 'No authorization code received',
              })
            )
          }
          console.log(
            '[Auth] Exchanging code for token. Code length:',
            code.length
          )
          console.log('[Auth] Code (first 10 chars):', code.substring(0, 10))
          const token = yield* httpService.exchangeCodeForToken(code)
          console.log('[Auth] Token received, fetching user...')
          const user = yield* httpService.fetchUser(token)
          console.log('[Auth] User fetched successfully:', user.login)

          // Add account to AccountContext
          console.log('[Auth] Adding account to context...')
          const account = yield* accountService.addAccount({
            provider: 'github',
            providerId: user.id.toString(),
            username: user.login,
            displayName: user.name ?? undefined,
            avatarUrl: user.avatar_url ?? undefined,
          })
          console.log('[Auth] Account added:', account.id)

          // Store token for this account
          console.log('[Auth] Storing token for account...')
          yield* storeService.setAuthForAccount(
            account.id,
            Redacted.make(token)
          )
          console.log('[Auth] Token stored successfully')
          console.log('[Auth] Auth flow complete!')

          return { token: Redacted.make(token), user, account }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              console.log('[Auth] Clearing sign-in progress flag')
              isSignInInProgress = false
            })
          )
        ),

        /**
         * Sign out - removes the active account
         */
        signOut: Effect.gen(function* () {
          const activeAccount =
            yield* accountService.getActiveAccountForProvider('github')
          if (activeAccount) {
            yield* storeService.clearAuthForAccount(activeAccount.id)
            yield* accountService.removeAccount(activeAccount.id)
          }
        }),

        /**
         * Sign out a specific GitHub account
         */
        signOutAccount: (accountId: AccountId) =>
          Effect.gen(function* () {
            yield* storeService.clearAuthForAccount(accountId)
            yield* accountService.removeAccount(accountId)
          }),

        /**
         * Check authentication status for the active account
         */
        checkAuth: Effect.gen(function* () {
          const activeAccount =
            yield* accountService.getActiveAccountForProvider('github')
          if (!activeAccount) {
            return { authenticated: false, user: Option.none() }
          }

          const tokenOption = yield* storeService.getAuthForAccount(
            activeAccount.id
          )
          if (Option.isNone(tokenOption)) {
            return { authenticated: false, user: Option.none() }
          }

          const token = Option.getOrThrow(tokenOption)
          const user = yield* httpService.fetchUser(Redacted.value(token))

          return { authenticated: true, user: Option.some(user) }
        }),

        /**
         * Check authentication status for a specific account
         */
        checkAuthForAccount: (accountId: AccountId) =>
          Effect.gen(function* () {
            const tokenOption = yield* storeService.getAuthForAccount(accountId)
            if (Option.isNone(tokenOption)) {
              return { authenticated: false as const, user: Option.none() }
            }

            const token = Option.getOrThrow(tokenOption)
            const user = yield* httpService.fetchUser(Redacted.value(token))

            return { authenticated: true as const, user: Option.some(user) }
          }),
      }
    }),
  }
) {}
