import { shell, app } from 'electron'
import { Effect, Redacted, Duration, Option } from 'effect'
import { URL } from 'url'
import { GitHubAuthError, GitHubAuthTimeout } from './errors'
import { GitHubHttpService } from './http-service'
import { SecureStoreService } from './store-service'

const PROTOCOL_SCHEME = 'geppetto'

// Augment Electron's app with custom oauth-callback event
interface OAuthApp {
  on(event: 'oauth-callback', listener: (url: string) => void): this
  removeListener(event: 'oauth-callback', listener: (url: string) => void): this
}

export class GitHubAuthService extends Effect.Service<GitHubAuthService>()(
  'GitHubAuthService',
  {
    dependencies: [GitHubHttpService.Default, SecureStoreService.Default],
    effect: Effect.gen(function* () {
      const httpService = yield* GitHubHttpService
      const storeService = yield* SecureStoreService

      const generateRandomState = () =>
        Math.random().toString(36).substring(2, 15)
      const clientId = process.env.GITHUB_CLIENT_ID || 'your-client-id'
      const redirectUri = `${PROTOCOL_SCHEME}://auth/callback`

      return {
        startAuthFlow: Effect.gen(function* () {
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

          // Wait for OAuth callback via protocol handler
          console.log('[Auth] Setting up oauth-callback listener...')
          const code = yield* Effect.async<string, GitHubAuthError>(resume => {
            let hasResolved = false

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
                  ;(app as unknown as OAuthApp).removeListener('oauth-callback', handleCallback)
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
                  ;(app as unknown as OAuthApp).removeListener('oauth-callback', handleCallback)
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
              ;(app as unknown as OAuthApp).removeListener('oauth-callback', handleCallback)
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

          yield* storeService.setAuth(Redacted.make(token), user)

          return { token: Redacted.make(token), user }
        }),
      }
    }),
  }
) {}
