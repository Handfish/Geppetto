import { ipcMain } from 'electron'
import { Effect, Schema as S } from 'effect'
import { GitHubIpcContracts, type IpcContracts } from '../../shared/ipc-contracts'
import { GitHubAuthService } from '../github/auth-service'
import { GitHubApiService } from '../github/api-service'
import { AuthenticationError, NetworkError } from '../../shared/schemas/errors'

export const setupGitHubIpcHandlers = Effect.gen(function* () {
  const authService = yield* GitHubAuthService
  const apiService = yield* GitHubApiService

  const handlers = {
    signIn: () => authService.startAuthFlow,
    checkAuth: () => apiService.checkAuth,
    signOut: () => apiService.signOut,
    getRepos: ({ username }: { username?: string }) => apiService.getRepos(username),
    getRepo: ({ owner, repo }: { owner: string; repo: string }) => apiService.getRepo(owner, repo),
    getIssues: ({ owner, repo, state }: { owner: string; repo: string; state?: 'open' | 'closed' | 'all' }) =>
      apiService.getIssues(owner, repo, state),
    getPullRequests: ({ owner, repo, state }: { owner: string; repo: string; state?: 'open' | 'closed' | 'all' }) =>
      apiService.getPullRequests(owner, repo, state),
  } as const

  for (const [name, contract] of Object.entries(GitHubIpcContracts)) {
    const handler = handlers[name as keyof typeof handlers]
    
    ipcMain.handle(contract.channel, async (event, input) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(contract.input)(input)
        const result = yield* handler(validatedInput as any)
        console.log(`[IPC Handler ${name}] Result:`, result)
        const encoded = yield* S.encode(contract.output)(result)
        console.log(`[IPC Handler ${name}] Encoded:`, encoded)
        return encoded
      }).pipe(
        Effect.catchAll((error) => {
          console.error(`[IPC Handler ${name}] Error:`, error)
          if (error._tag === 'GitHubAuthError' || error._tag === 'GitHubAuthTimeout') {
            return Effect.succeed({
              _tag: 'Error' as const,
              error: new AuthenticationError({ message: error.message }),
            })
          }
          if (error._tag === 'GitHubTokenExchangeError') {
            return Effect.succeed({
              _tag: 'Error' as const,
              error: new AuthenticationError({ message: error.message }),
            })
          }
          if (error._tag === 'GitHubApiError' || error._tag === 'NotAuthenticatedError') {
            return Effect.succeed({
              _tag: 'Error' as const,
              error: new NetworkError({ message: error.message }),
            })
          }
          return Effect.succeed({
            _tag: 'Error' as const,
            error: new NetworkError({ message: `Unexpected error occurred: ${error.message || JSON.stringify(error)}` }),
          })
        })
      )

      const finalResult = await Effect.runPromise(program)
      console.log(`[IPC Handler ${name}] Final result being sent:`, finalResult)
      return finalResult
    })
  }
})

