import { Effect, Schema as S, ParseResult } from 'effect'
import { IpcContracts, type IpcChannels } from '../../shared/ipc-contracts'
import { NetworkError } from '../../shared/schemas/errors'

export class ElectronIpcClient extends Effect.Service<ElectronIpcClient>()(
  'ElectronIpcClient',
  {
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
          const validatedInput = yield* S.decodeUnknown(inputSchema)(
            input
          ).pipe(
            Effect.mapError(
              parseError =>
                new NetworkError({
                  message: `Input validation failed: ${ParseResult.TreeFormatter.formatErrorSync(parseError)}`,
                })
            )
          )

          const rawResult = yield* Effect.tryPromise({
            try: () =>
              window.electron.ipcRenderer.invoke(
                contract.channel,
                validatedInput
              ),
            catch: error =>
              new NetworkError({
                message:
                  error instanceof Error
                    ? error.message
                    : 'IPC communication failed',
              }),
          })

          console.log(`[IPC Client ${channel}] Raw result:`, rawResult)

          if (
            rawResult &&
            typeof rawResult === 'object' &&
            '_tag' in rawResult &&
            rawResult._tag === 'Error'
          ) {
            console.log(
              `[IPC Client ${channel}] Received error:`,
              'error' in rawResult ? rawResult.error : 'Unknown error'
            )

            // Decode the error using the contract's error schema
            if ('error' in rawResult && rawResult.error) {
              const decodedError = yield* S.decodeUnknown(contract.errors as S.Schema.Any)(rawResult.error).pipe(
                Effect.mapError(
                  parseError =>
                    new NetworkError({
                      message: `Error decoding failed: ${ParseResult.TreeFormatter.formatErrorSync(parseError)}`,
                    })
                )
              )
              console.log(`[IPC Client ${channel}] Decoded error:`, decodedError)
              return yield* Effect.fail(decodedError as S.Schema.Type<(typeof IpcContracts)[T]['errors']>)
            }

            // Fallback to generic error
            return yield* Effect.fail(
              new NetworkError({
                message: 'Unknown error',
              }) as S.Schema.Type<(typeof IpcContracts)[T]['errors']>
            )
          }

          // Decode output using the contract's output schema
          const outputSchema: S.Schema.Any = contract.output
          const decoded = yield* S.decodeUnknown(outputSchema)(rawResult).pipe(
            Effect.mapError(
              parseError =>
                new NetworkError({
                  message: `Output validation failed: ${ParseResult.TreeFormatter.formatErrorSync(parseError)}`,
                })
            )
          )
          console.log(`[IPC Client ${channel}] Decoded result:`, decoded)
          return decoded as S.Schema.Type<(typeof IpcContracts)[T]['output']>
        }) as Effect.Effect<
          S.Schema.Type<(typeof IpcContracts)[T]['output']>,
          S.Schema.Type<(typeof IpcContracts)[T]['errors']> | NetworkError,
          never
        >,
    }),
  }
) {}

export class ProviderClient extends Effect.Service<ProviderClient>()(
  'ProviderClient',
  {
    dependencies: [ElectronIpcClient.Default],
    effect: Effect.gen(function* () {
      const ipc = yield* ElectronIpcClient
      type SignInInput = S.Schema.Type<(typeof IpcContracts)['signIn']['input']>
      type CheckAuthInput = S.Schema.Type<
        (typeof IpcContracts)['checkAuth']['input']
      >
      type SignOutInput = S.Schema.Type<
        (typeof IpcContracts)['signOut']['input']
      >
      type AccountReposInput = S.Schema.Type<
        (typeof IpcContracts)['getAccountRepositories']['input']
      >
      type ProviderReposInput = S.Schema.Type<
        (typeof IpcContracts)['getProviderRepositories']['input']
      >

      return {
        signIn: (provider: SignInInput['provider']) =>
          Effect.gen(function* () {
            console.log('[ProviderClient] signIn called for provider:', provider)
            const result = yield* ipc.invoke('signIn', { provider })
            console.log('[ProviderClient] signIn completed successfully:', result)
            return result
          }).pipe(
            Effect.tapError((error) =>
              Effect.sync(() => {
                console.error('[ProviderClient] signIn failed with error:', error)
              })
            )
          ),
        checkAuth: (accountId: CheckAuthInput['accountId']) =>
          ipc.invoke('checkAuth', { accountId }),
        signOut: (accountId: SignOutInput['accountId']) =>
          Effect.gen(function* () {
            console.log('[ProviderClient] signOut called for account:', accountId)
            const result = yield* ipc.invoke('signOut', { accountId })
            console.log('[ProviderClient] signOut completed')
            return result
          }),
        getAccountRepositories: (accountId: AccountReposInput['accountId']) =>
          ipc.invoke('getAccountRepositories', { accountId }),
        getProviderRepositories: (provider: ProviderReposInput['provider']) =>
          ipc.invoke('getProviderRepositories', { provider }),
      } as const
    }),
  }
) {}

export class AiProviderClient extends Effect.Service<AiProviderClient>()(
  'AiProviderClient',
  {
    dependencies: [ElectronIpcClient.Default],
    effect: Effect.gen(function* () {
      const ipc = yield* ElectronIpcClient
      type AiSignInInput = S.Schema.Type<
        (typeof IpcContracts)['aiProvider:signIn']['input']
      >
      type AiSignOutInput = S.Schema.Type<
        (typeof IpcContracts)['aiProvider:signOut']['input']
      >
      type AiCheckAuthInput = S.Schema.Type<
        (typeof IpcContracts)['aiProvider:checkAuth']['input']
      >
      type AiUsageInput = S.Schema.Type<
        (typeof IpcContracts)['aiProvider:getUsage']['input']
      >
      type AiProviderUsageInput = S.Schema.Type<
        (typeof IpcContracts)['aiProvider:getProviderUsage']['input']
      >

      return {
        signIn: (provider: AiSignInInput['provider']) =>
          ipc.invoke('aiProvider:signIn', { provider }),
        signOut: (accountId: AiSignOutInput['accountId']) =>
          ipc.invoke('aiProvider:signOut', { accountId }),
        checkAuth: (accountId: AiCheckAuthInput['accountId']) =>
          ipc.invoke('aiProvider:checkAuth', { accountId }),
        getUsage: (accountId: AiUsageInput['accountId']) =>
          ipc.invoke('aiProvider:getUsage', { accountId }),
        getProviderUsage: (provider: AiProviderUsageInput['provider']) =>
          ipc.invoke('aiProvider:getProviderUsage', { provider }),
      } as const
    }),
  }
) {}

export class AccountClient extends Effect.Service<AccountClient>()(
  'AccountClient',
  {
    dependencies: [ElectronIpcClient.Default],
    effect: Effect.gen(function* () {
      const ipc = yield* ElectronIpcClient
      type SwitchAccountInput = S.Schema.Type<
        (typeof IpcContracts)['switchAccount']['input']
      >
      type RemoveAccountInput = S.Schema.Type<
        (typeof IpcContracts)['removeAccount']['input']
      >

      return {
        getContext: () => ipc.invoke('getAccountContext', undefined),
        getActiveAccount: () => ipc.invoke('getActiveAccount', undefined),
        switchAccount: (accountId: SwitchAccountInput['accountId']) =>
          ipc.invoke('switchAccount', { accountId }),
        removeAccount: (accountId: RemoveAccountInput['accountId']) =>
          ipc.invoke('removeAccount', { accountId }),
        getTierLimits: () => ipc.invoke('getTierLimits', undefined),
      } as const
    }),
  }
) {}

export class WorkspaceClient extends Effect.Service<WorkspaceClient>()(
  'WorkspaceClient',
  {
    dependencies: [ElectronIpcClient.Default],
    effect: Effect.gen(function* () {
      const ipc = yield* ElectronIpcClient
      type SetPathInput = S.Schema.Type<
        (typeof IpcContracts)['setWorkspacePath']['input']
      >
      type CloneToWorkspaceInput = S.Schema.Type<
        (typeof IpcContracts)['cloneToWorkspace']['input']
      >
      type CheckRepositoryInput = S.Schema.Type<
        (typeof IpcContracts)['checkRepositoryInWorkspace']['input']
      >

      return {
        getConfig: () => ipc.invoke('getWorkspaceConfig', undefined),
        setPath: (path: SetPathInput['path']) =>
          ipc.invoke('setWorkspacePath', { path }),
        selectDirectory: () => ipc.invoke('selectWorkspaceDirectory', undefined),
        cloneToWorkspace: (input: CloneToWorkspaceInput) =>
          ipc.invoke('cloneToWorkspace', input),
        checkRepositoryInWorkspace: (input: CheckRepositoryInput) =>
          ipc.invoke('checkRepositoryInWorkspace', input),
        discoverWorkspaceRepositories: () =>
          ipc.invoke('discoverWorkspaceRepositories', undefined),
        getWorkspaceRepositories: () =>
          ipc.invoke('getWorkspaceRepositories', undefined),
      } as const
    }),
  }
) {}

export class AiWatcherClient extends Effect.Service<AiWatcherClient>()(
  'AiWatcherClient',
  {
    dependencies: [ElectronIpcClient.Default],
    effect: Effect.gen(function* () {
      const ipc = yield* ElectronIpcClient
      type CreateWatcherInput = S.Schema.Type<
        (typeof IpcContracts)['ai-watcher:create']['input']
      >
      type AttachTmuxInput = S.Schema.Type<
        (typeof IpcContracts)['ai-watcher:attach-tmux']['input']
      >
      type GetWatcherInput = S.Schema.Type<
        (typeof IpcContracts)['ai-watcher:get']['input']
      >
      type StopWatcherInput = S.Schema.Type<
        (typeof IpcContracts)['ai-watcher:stop']['input']
      >
      type StartWatcherInput = S.Schema.Type<
        (typeof IpcContracts)['ai-watcher:start']['input']
      >
      type GetLogsInput = S.Schema.Type<
        (typeof IpcContracts)['ai-watcher:get-logs']['input']
      >

      return {
        createWatcher: (config: CreateWatcherInput) =>
          ipc.invoke('ai-watcher:create', config),
        attachToTmuxSession: (sessionName: AttachTmuxInput['sessionName']) =>
          ipc.invoke('ai-watcher:attach-tmux', { sessionName }),
        listWatchers: () => ipc.invoke('ai-watcher:list', undefined),
        getWatcher: (watcherId: GetWatcherInput['watcherId']) =>
          ipc.invoke('ai-watcher:get', { watcherId }),
        stopWatcher: (watcherId: StopWatcherInput['watcherId']) =>
          ipc.invoke('ai-watcher:stop', { watcherId }),
        startWatcher: (watcherId: StartWatcherInput['watcherId']) =>
          ipc.invoke('ai-watcher:start', { watcherId }),
        getWatcherLogs: (
          watcherId: GetLogsInput['watcherId'],
          limit?: GetLogsInput['limit']
        ) => ipc.invoke('ai-watcher:get-logs', { watcherId, limit }),
        listTmuxSessions: () => ipc.invoke('ai-watcher:list-tmux', undefined),
      } as const
    }),
  }
) {}

export class GitHubIssueClient extends Effect.Service<GitHubIssueClient>()(
  'GitHubIssueClient',
  {
    dependencies: [ElectronIpcClient.Default],
    effect: Effect.gen(function* () {
      const ipc = yield* ElectronIpcClient
      type ListIssuesInput = S.Schema.Type<
        (typeof IpcContracts)['github:list-repository-issues']['input']
      >
      type GetIssueInput = S.Schema.Type<
        (typeof IpcContracts)['github:get-issue']['input']
      >
      type GetCommentsInput = S.Schema.Type<
        (typeof IpcContracts)['github:get-issue-comments']['input']
      >

      return {
        listRepositoryIssues: (params: ListIssuesInput) =>
          Effect.gen(function* () {
            console.log(
              `[GitHubIssueClient] listRepositoryIssues called for ${params.owner}/${params.repo}`
            )
            const result = yield* ipc.invoke(
              'github:list-repository-issues',
              params
            )
            console.log(
              `[GitHubIssueClient] listRepositoryIssues completed: ${result.length} issues`
            )
            return result
          }),
        getIssue: (params: GetIssueInput) =>
          Effect.gen(function* () {
            console.log(
              `[GitHubIssueClient] getIssue called for ${params.owner}/${params.repo}#${params.issueNumber}`
            )
            const result = yield* ipc.invoke('github:get-issue', params)
            console.log(`[GitHubIssueClient] getIssue completed: #${result.number}`)
            return result
          }),
        getIssueComments: (params: GetCommentsInput) =>
          Effect.gen(function* () {
            console.log(
              `[GitHubIssueClient] getIssueComments called for ${params.owner}/${params.repo}#${params.issueNumber}`
            )
            const result = yield* ipc.invoke(
              'github:get-issue-comments',
              params
            )
            console.log(
              `[GitHubIssueClient] getIssueComments completed: ${result.length} comments`
            )
            return result
          }),
      } as const
    }),
  }
) {}

/**
 * Source Control Client - IPC operations for git worktree operations
 */
export class SourceControlClient extends Effect.Service<SourceControlClient>()(
  'SourceControlClient',
  {
    dependencies: [ElectronIpcClient.Default],
    effect: Effect.gen(function* () {
      const ipc = yield* ElectronIpcClient

      return {
        createWorktreeForIssue: (params: {
          repositoryId: { value: string }
          issueNumber: number
          baseBranch?: string
        }) =>
          Effect.gen(function* () {
            console.log(
              `[SourceControlClient] createWorktreeForIssue called for issue #${params.issueNumber}`
            )
            const result = yield* ipc.invoke(
              'source-control:create-worktree-for-issue',
              params
            )
            console.log(
              `[SourceControlClient] Worktree created at ${result.worktreePath}`
            )
            return result
          }),

        removeWorktree: (params: {
          repositoryId: { value: string }
          worktreePath: string
        }) =>
          Effect.gen(function* () {
            console.log(
              `[SourceControlClient] removeWorktree called for ${params.worktreePath}`
            )
            yield* ipc.invoke('source-control:remove-worktree', params)
            console.log(`[SourceControlClient] Worktree removed`)
          }),

        listWorktrees: (params: { repositoryId: { value: string } }) =>
          Effect.gen(function* () {
            console.log(
              `[SourceControlClient] listWorktrees called for repo ${params.repositoryId.value}`
            )
            const result = yield* ipc.invoke(
              'source-control:list-worktrees',
              params
            )
            console.log(
              `[SourceControlClient] Found ${result.length} worktrees`
            )
            return result
          }),
      } as const
    }),
  }
) {}
