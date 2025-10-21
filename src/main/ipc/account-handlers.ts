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

    ipcMain.handle(contract.channel, async (_event, input: unknown) => {
      // Decode input
      const decodeInput = S.decodeUnknown(contract.input)
      const decodedInput = await Effect.runPromise(decodeInput(input))

      // Execute handler with error mapping
      const result = await Effect.runPromise(
        handler(decodedInput as ContractInput<K>).pipe(
          Effect.mapError(mapDomainErrorToIpcError),
          Effect.either
        )
      )

      return result
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
      enableAccountSwitcher: tierService.isMultiAccountEnabled(),
    })
  )
})
