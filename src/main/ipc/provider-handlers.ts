/**
 * VCS Provider IPC Handlers
 *
 * Handles IPC communication for version control system providers (GitHub, GitLab, etc.)
 * using the generic registerIpcHandler pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect } from 'effect'
import { ProviderIpcContracts } from '../../shared/ipc-contracts'
import { VcsProviderService } from '../providers/vcs-provider-service'
import { registerIpcHandler } from './ipc-handler-setup'

/**
 * Setup VCS provider IPC handlers
 */
export const setupProviderIpcHandlers = Effect.gen(function* () {
  const providerService = yield* VcsProviderService

  // Sign in to provider
  registerIpcHandler(ProviderIpcContracts.signIn, (input) =>
    providerService.signIn(input.provider)
  )

  // Sign out from account
  registerIpcHandler(ProviderIpcContracts.signOut, (input) =>
    providerService.signOut(input.accountId)
  )

  // Check authentication status
  registerIpcHandler(ProviderIpcContracts.checkAuth, (input) =>
    providerService.checkAuth(input.accountId)
  )

  // Get repositories for specific account
  registerIpcHandler(ProviderIpcContracts.getAccountRepositories, (input) =>
    providerService.getRepositories(input.accountId)
  )

  // Get all repositories for a provider (all accounts)
  registerIpcHandler(ProviderIpcContracts.getProviderRepositories, (input) =>
    providerService.getRepositoriesByProvider(input.provider)
  )
})
