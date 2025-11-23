/**
 * AI Provider IPC Handlers
 *
 * Handles IPC communication for AI providers (OpenAI, Claude, etc.)
 * using the generic registerIpcHandler pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect } from 'effect'
import { AiProviderIpcContracts } from '../../shared/ipc-contracts'
import { AiProviderService } from '../ai-provider-usage-webscraper/ai-provider-service'
import { registerIpcHandler } from './ipc-handler-setup'

/**
 * Setup AI provider IPC handlers
 */
export const setupAiProviderIpcHandlers = Effect.gen(function* () {
  const aiProviderService = yield* AiProviderService

  // Sign in to AI provider
  registerIpcHandler(AiProviderIpcContracts['aiProvider:signIn'], (input) =>
    aiProviderService.signIn(input.provider)
  )

  // Sign out from AI account
  registerIpcHandler(AiProviderIpcContracts['aiProvider:signOut'], (input) =>
    aiProviderService.signOut(input.accountId)
  )

  // Check AI authentication status
  registerIpcHandler(AiProviderIpcContracts['aiProvider:checkAuth'], (input) =>
    aiProviderService.checkAuth(input.accountId)
  )

  // Get AI usage for specific account
  registerIpcHandler(AiProviderIpcContracts['aiProvider:getUsage'], (input) =>
    aiProviderService.getUsage(input.accountId)
  )

  // Get AI usage for all accounts of a provider
  registerIpcHandler(
    AiProviderIpcContracts['aiProvider:getProviderUsage'],
    (input) => aiProviderService.getUsageByProvider(input.provider)
  )

  // Get AI accounts for a provider (independent of usage)
  registerIpcHandler(
    AiProviderIpcContracts['aiProvider:getProviderAccounts'],
    (input) => aiProviderService.getProviderAccounts(input.provider)
  )
})
