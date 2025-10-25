/**
 * Account Management IPC Handlers
 *
 * Handles IPC communication for multi-account management using the generic
 * registerIpcHandler pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect } from 'effect'
import { AccountIpcContracts } from '../../shared/ipc-contracts'
import { AccountContextService } from '../account/account-context-service'
import { TierService } from '../tier/tier-service'
import { registerIpcHandler } from './ipc-handler-setup'

/**
 * Setup account IPC handlers
 */
export const setupAccountIpcHandlers = Effect.gen(function* () {
  const accountService = yield* AccountContextService
  const tierService = yield* TierService

  // Get account context
  registerIpcHandler(AccountIpcContracts.getAccountContext, () =>
    accountService.getContext()
  )

  // Switch active account
  registerIpcHandler(AccountIpcContracts.switchAccount, (input) =>
    accountService.switchAccount(input.accountId)
  )

  // Remove account
  registerIpcHandler(AccountIpcContracts.removeAccount, (input) =>
    accountService.removeAccount(input.accountId)
  )

  // Get active account
  registerIpcHandler(AccountIpcContracts.getActiveAccount, () =>
    accountService.getActiveAccount()
  )

  // Get tier limits
  registerIpcHandler(AccountIpcContracts.getTierLimits, () =>
    Effect.sync(() => {
      const limits = tierService.getTierLimits()
      return {
        tier: limits.tier,
        maxGitHubAccounts: tierService.getMaxAccountsForProvider('github'),
        maxGitLabAccounts: tierService.getMaxAccountsForProvider('gitlab'),
        maxBitbucketAccounts:
          tierService.getMaxAccountsForProvider('bitbucket'),
        maxGiteaAccounts: tierService.getMaxAccountsForProvider('gitea'),
        maxOpenAiAccounts: tierService.getMaxAiAccountsForProvider('openai') ?? 0,
        maxClaudeAccounts: tierService.getMaxAiAccountsForProvider('claude') ?? 0,
        enableAccountSwitcher: tierService.isMultiAccountEnabled(),
        enableAiProviders: limits.enableAiProviders,
      } as const
    })
  )
})
