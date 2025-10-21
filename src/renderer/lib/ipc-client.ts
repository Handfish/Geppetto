import { Effect, Schema as S, Context, Layer } from 'effect'
import type { IpcContracts, IpcChannels } from '../../shared/ipc-contracts'
import { GitHubIpcContracts } from '../../shared/ipc-contracts'
import { NetworkError } from '../../shared/schemas/errors'

export class ElectronIpcClient extends Effect.Service<ElectronIpcClient>()('ElectronIpcClient', {
  sync: () => ({
    invoke: <T extends IpcChannels>(
      channel: T,
      input: S.Schema.Type<IpcContracts[T]['input']>
    ): Effect.Effect<
      S.Schema.Type<IpcContracts[T]['output']>,
      S.Schema.Type<IpcContracts[T]['errors']> | NetworkError
    > =>
      Effect.gen(function* () {
        const contract = GitHubIpcContracts[channel]

        const validatedInput = yield* S.decodeUnknown(contract.input)(input)

        const rawResult = yield* Effect.tryPromise({
          try: () => window.electron.ipcRenderer.invoke(contract.channel, validatedInput),
          catch: (error) => new NetworkError({
            message: error instanceof Error ? error.message : 'IPC communication failed'
          })
        })

        console.log(`[IPC Client ${channel}] Raw result:`, rawResult)

        if (rawResult && typeof rawResult === 'object' && rawResult._tag === 'Error') {
          console.log(`[IPC Client ${channel}] Received error:`, rawResult.error)
          return yield* Effect.fail(rawResult.error)
        }

        const decoded = yield* S.decodeUnknown(contract.output)(rawResult)
        console.log(`[IPC Client ${channel}] Decoded result:`, decoded)
        return decoded
      })
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

