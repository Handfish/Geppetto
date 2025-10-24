/**
 * Workspace Management IPC Handlers
 *
 * Handles IPC communication for workspace directory management.
 */

import { Effect, Schema as S } from 'effect'
import { ipcMain, BrowserWindow } from 'electron'
import { WorkspaceIpcContracts } from '../../shared/ipc-contracts'
import { WorkspaceService } from '../workspace/workspace-service'
import { mapDomainErrorToIpcError } from './error-mapper'

type ContractInput<K extends keyof typeof WorkspaceIpcContracts> = S.Schema.Type<
  (typeof WorkspaceIpcContracts)[K]['input']
>
type ContractOutput<K extends keyof typeof WorkspaceIpcContracts> = S.Schema.Type<
  (typeof WorkspaceIpcContracts)[K]['output']
>

/**
 * Setup workspace IPC handlers
 */
export const setupWorkspaceIpcHandlers = Effect.gen(function* () {
  const workspaceService = yield* WorkspaceService

  /**
   * Helper to setup a handler with automatic error mapping
   */
  const setupHandler = <K extends keyof typeof WorkspaceIpcContracts, E>(
    key: K,
    handler: (input: ContractInput<K>) => Effect.Effect<ContractOutput<K>, E>
  ) => {
    const contract = WorkspaceIpcContracts[key]
    // Type assertions needed because TypeScript can't track the relationship between
    // the key and the contract schemas in the union type. Runtime safety is guaranteed
    // by the schema validation. We preserve both the decoded type and the encoded type.
    type InputSchema = S.Schema<
      ContractInput<K>,
      S.Schema.Encoded<(typeof WorkspaceIpcContracts)[K]['input']>
    >
    type OutputSchema = S.Schema<
      ContractOutput<K>,
      S.Schema.Encoded<(typeof WorkspaceIpcContracts)[K]['output']>
    >

    ipcMain.handle(contract.channel, async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        // Decode input using the contract's input schema
        // Runtime: validates and transforms from encoded to decoded type
        const validatedInput = yield* S.decodeUnknown(
          contract.input as unknown as InputSchema
        )(input)
        // Execute handler with properly typed input (now properly inferred as ContractInput<K>)
        const result = yield* handler(validatedInput)
        // Encode output using the contract's output schema
        // Runtime: transforms from decoded type to encoded (serializable) type
        const encoded = yield* S.encode(
          contract.output as unknown as OutputSchema
        )(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      const finalResult = await Effect.runPromise(program)
      return finalResult
    })
  }

  /**
   * Broadcast workspace change to all windows
   */
  const broadcastWorkspaceChange = () => {
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('workspace:changed')
    })
  }

  // Register handlers
  setupHandler('getWorkspaceConfig', () => workspaceService.getConfig)

  setupHandler('setWorkspacePath', input =>
    Effect.gen(function* () {
      yield* workspaceService.setWorkspacePath(input.path)
      broadcastWorkspaceChange()
    })
  )

  setupHandler('selectWorkspaceDirectory', () => workspaceService.selectDirectory)

  setupHandler('cloneToWorkspace', input =>
    workspaceService.cloneToWorkspace(
      input.cloneUrl,
      input.repoName,
      input.owner,
      input.defaultBranch,
      input.provider
    )
  )

  setupHandler('checkRepositoryInWorkspace', input =>
    workspaceService.checkRepositoryInWorkspace(
      input.owner,
      input.repoName,
      input.provider,
      input.defaultBranch
    )
  )
})
