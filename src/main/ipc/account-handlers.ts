/**
 * Account Management IPC Handlers
 *
 * Handles IPC communication for multi-account management.
 */

import { Effect, Schema as S } from 'effect'
import { ipcMain } from 'electron'
import { AccountIpcContracts } from '../../shared/ipc-contracts'
import { AccountContextService } from '../account/account-context-service'
import { TierService } from '../tier/tier-service'
import { mapDomainErrorToIpcError } from './error-mapper'

type ContractInput<K extends keyof typeof AccountIpcContracts> = S.Schema.Type<
  (typeof AccountIpcContracts)[K]['input']
>
type ContractOutput<K extends keyof typeof AccountIpcContracts> = S.Schema.Type<
  (typeof AccountIpcContracts)[K]['output']
>

/**
 * Setup account IPC handlers
 */
export const setupAccountIpcHandlers = Effect.gen(function* () {
  const accountService = yield* AccountContextService
  const tierService = yield* TierService

  /**
   * Helper to setup a handler with automatic error mapping
   */
  const setupHandler = <K extends keyof typeof AccountIpcContracts, E>(
    key: K,
    handler: (input: ContractInput<K>) => Effect.Effect<ContractOutput<K>, E>
  ) => {
    const contract = AccountIpcContracts[key]
    // Type assertions needed because TypeScript can't track the relationship between
    // the key and the contract schemas in the union type. Runtime safety is guaranteed
    // by the schema validation. We preserve both the decoded type and the encoded type.
    type InputSchema = S.Schema<ContractInput<K>, S.Schema.Encoded<typeof AccountIpcContracts[K]['input']>>
    type OutputSchema = S.Schema<ContractOutput<K>, S.Schema.Encoded<typeof AccountIpcContracts[K]['output']>>

    ipcMain.handle(contract.channel, async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        // Decode input using the contract's input schema
        // Runtime: validates and transforms from encoded to decoded type
        const validatedInput = yield* S.decodeUnknown(contract.input as unknown as InputSchema)(input)
        // Execute handler with properly typed input (now properly inferred as ContractInput<K>)
        const result = yield* handler(validatedInput)
        // Encode output using the contract's output schema
        // Runtime: transforms from decoded type to encoded (serializable) type
        const encoded = yield* S.encode(contract.output as unknown as OutputSchema)(result)
        return encoded
      }).pipe(
        Effect.catchAll(mapDomainErrorToIpcError)
      )

      const finalResult = await Effect.runPromise(program)
      return finalResult
    })
  }

  // Register handlers
  setupHandler('getAccountContext', () => accountService.getContext())

  setupHandler('switchAccount', (input) => accountService.switchAccount(input.accountId))

  setupHandler('removeAccount', (input) => accountService.removeAccount(input.accountId))

  setupHandler('getActiveAccount', () => accountService.getActiveAccount())

  setupHandler('getTierLimits', () =>
    Effect.succeed({
      tier: tierService.getTierLimits().tier,
      maxGitHubAccounts: tierService.getMaxAccountsForProvider('github'),
      maxGitLabAccounts: tierService.getMaxAccountsForProvider('gitlab'),
      maxBitbucketAccounts: tierService.getMaxAccountsForProvider('bitbucket'),
      maxGiteaAccounts: tierService.getMaxAccountsForProvider('gitea'),
      enableAccountSwitcher: tierService.isMultiAccountEnabled(),
    })
  )
})
