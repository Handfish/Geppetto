import { Effect, Schema as S, ParseResult } from 'effect'
import { IpcContracts, type IpcChannels } from '../../shared/ipc-contracts'
import { NetworkError } from '../../shared/schemas/errors'

export class ElectronIpcClient extends Effect.Service<ElectronIpcClient>()('ElectronIpcClient', {
  sync: () => ({
    invoke: <T extends IpcChannels>(
      channel: T,
      input: S.Schema.Type<(typeof IpcContracts)[T]['input']>
    ): Effect.Effect<
      S.Schema.Type<(typeof IpcContracts)[T]['output']>,
      S.Schema.Type<(typeof IpcContracts)[T]['errors']> | NetworkError,
      never
    > =>
      Effect.gen(function* () {
        const contract = IpcContracts[channel]

        // Validate input using the contract's input schema
        // Use S.Schema.Any to handle polymorphic schemas properly
        const inputSchema: S.Schema.Any = contract.input
        const validatedInput = yield* S.decodeUnknown(inputSchema)(input).pipe(
          Effect.mapError((parseError) => new NetworkError({
            message: `Input validation failed: ${ParseResult.TreeFormatter.formatErrorSync(parseError)}`
          }))
        )

        const rawResult = yield* Effect.tryPromise({
          try: () => window.electron.ipcRenderer.invoke(contract.channel, validatedInput),
          catch: (error) => new NetworkError({
            message: error instanceof Error ? error.message : 'IPC communication failed'
          })
        })

        console.log(`[IPC Client ${channel}] Raw result:`, rawResult)

        if (rawResult && typeof rawResult === 'object' && '_tag' in rawResult && rawResult._tag === 'Error') {
          console.log(`[IPC Client ${channel}] Received error:`, 'error' in rawResult ? rawResult.error : 'Unknown error')
          // Type the error properly as it comes from the IPC contract
          return yield* Effect.fail(('error' in rawResult ? rawResult.error : new NetworkError({ message: 'Unknown error' })) as S.Schema.Type<(typeof IpcContracts)[T]['errors']>)
        }

        // Decode output using the contract's output schema
        const outputSchema: S.Schema.Any = contract.output
        const decoded = yield* S.decodeUnknown(outputSchema)(rawResult).pipe(
          Effect.mapError((parseError) => new NetworkError({
            message: `Output validation failed: ${ParseResult.TreeFormatter.formatErrorSync(parseError)}`
          }))
        )
        console.log(`[IPC Client ${channel}] Decoded result:`, decoded)
        return decoded as S.Schema.Type<(typeof IpcContracts)[T]['output']>
      }) as Effect.Effect<
        S.Schema.Type<(typeof IpcContracts)[T]['output']>,
        S.Schema.Type<(typeof IpcContracts)[T]['errors']> | NetworkError,
        never
      >
  })
}) {}

export class GitHubClient extends Effect.Service<GitHubClient>()('GitHubClient', {
  dependencies: [ElectronIpcClient.Default],
  effect: Effect.gen(function* () {
    const ipc = yield* ElectronIpcClient

    return {
      signIn: () => ipc.invoke('signIn', undefined),
      checkAuth: () => ipc.invoke('checkAuth', undefined),
      signOut: () => ipc.invoke('signOut', undefined),
      getRepos: (username?: string) => ipc.invoke('getRepos', { username }),
      getRepo: (owner: string, repo: string) => ipc.invoke('getRepo', { owner, repo }),
      getIssues: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') =>
        ipc.invoke('getIssues', { owner, repo, state: state ?? 'open' }),
      getPullRequests: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') =>
        ipc.invoke('getPullRequests', { owner, repo, state: state ?? 'open' }),
    } as const
  }),
}) {}

