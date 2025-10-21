import { ipcMain } from 'electron'
import { Effect, Schema as S } from 'effect'
import { GitHubIpcContracts, type IpcContracts } from '../../shared/ipc-contracts'
import { GitHubAuthService } from '../github/auth-service'
import { GitHubApiService } from '../github/api-service'
import { mapDomainErrorToIpcError } from './error-mapper'

export const setupGitHubIpcHandlers = Effect.gen(function* () {
  const authService = yield* GitHubAuthService
  const apiService = yield* GitHubApiService

  // Extract schema types for each contract
  type ContractInput<K extends keyof IpcContracts> = S.Schema.Type<IpcContracts[K]['input']>
  type ContractOutput<K extends keyof IpcContracts> = S.Schema.Type<IpcContracts[K]['output']>

  // Type-safe handler setup using generics properly
  // Handler can return any Effect with proper output type - errors are caught and mapped
  const setupHandler = <K extends keyof IpcContracts, E>(
    key: K,
    handler: (input: ContractInput<K>) => Effect.Effect<ContractOutput<K>, E>
  ) => {
    const contract = GitHubIpcContracts[key]
    // Type assertions needed because TypeScript can't track the relationship between
    // the key and the contract schemas in the union type. Runtime safety is guaranteed
    // by the schema validation.
    type InputSchema = S.Schema<ContractInput<K>, S.Schema.Encoded<IpcContracts[K]['input']>>
    type OutputSchema = S.Schema<ContractOutput<K>, S.Schema.Encoded<IpcContracts[K]['output']>>

    ipcMain.handle(contract.channel, async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        // Decode input using the contract's input schema
        const validatedInput = yield* S.decodeUnknown(contract.input as unknown as InputSchema)(input)
        // Execute handler with properly typed input
        const result = yield* handler(validatedInput)
        console.log(`[IPC Handler ${key}] Result:`, result)
        // Encode output using the contract's output schema
        const encoded = yield* S.encode(contract.output as unknown as OutputSchema)(result)
        console.log(`[IPC Handler ${key}] Encoded:`, encoded)
        return encoded
      }).pipe(
        Effect.catchAll(mapDomainErrorToIpcError)
      )

      const finalResult = await Effect.runPromise(program)
      console.log(`[IPC Handler ${key}] Final result being sent:`, finalResult)
      return finalResult
    })
  }

  // Register all handlers with full type safety
  setupHandler('signIn', (_input: ContractInput<'signIn'>) => authService.startAuthFlow)
  setupHandler('checkAuth', (_input: ContractInput<'checkAuth'>) => apiService.checkAuth)
  setupHandler('signOut', (_input: ContractInput<'signOut'>) => apiService.signOut)
  setupHandler('getRepos', (input: ContractInput<'getRepos'>) => apiService.getRepos(input.username))
  setupHandler('getRepo', (input: ContractInput<'getRepo'>) => apiService.getRepo(input.owner, input.repo))
  setupHandler('getIssues', (input: ContractInput<'getIssues'>) =>
    apiService.getIssues(input.owner, input.repo, input.state))
  setupHandler('getPullRequests', (input: ContractInput<'getPullRequests'>) =>
    apiService.getPullRequests(input.owner, input.repo, input.state))
})

