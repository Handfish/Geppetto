import { Effect, Schema as S } from 'effect'
import Store from 'electron-store'
import {
  AiAccount,
  AiAccountContext,
  type AiAccountId,
  type AiProviderType,
} from '../../shared/schemas/ai/provider'
import { TierService } from '../tier/tier-service'

type StoredAiAccountContext = S.Schema.Encoded<typeof AiAccountContext>

export class AiAccountContextService extends Effect.Service<AiAccountContextService>()(
  'AiAccountContextService',
  {
    dependencies: [TierService.Default],
    effect: Effect.gen(function* () {
      const tierService = yield* TierService
      const defaultContext = S.encodeSync(AiAccountContext)(
        AiAccountContext.empty()
      )

      const store = new Store<{ aiAccountContext: StoredAiAccountContext }>({
        name: 'ai-account-context',
        defaults: {
          aiAccountContext: defaultContext,
        },
      })

      const loadContext = (): AiAccountContext => {
        const stored = store.get('aiAccountContext')
        const context = S.decodeUnknownSync(AiAccountContext)(stored)
        console.log(
          `[AiAccountContext] Loaded context with ${context.accounts.length} accounts:`,
          context.accounts.map(a => a.id)
        )
        return context
      }

      const saveContext = (context: AiAccountContext): void => {
        console.log(
          `[AiAccountContext] Saving context with ${context.accounts.length} accounts:`,
          context.accounts.map(a => a.id)
        )
        const encoded = S.encodeSync(AiAccountContext)(context)
        store.set('aiAccountContext', encoded)
        console.log(`[AiAccountContext] Context saved successfully`)
      }

      return {
        getContext: () => Effect.succeed(loadContext()),

        addAccount: (params: {
          provider: AiProviderType
          identifier: string
          label: string
          apiKeyPreview?: string
        }) =>
          Effect.gen(function* () {
            console.log(
              `[AiAccountContext] Adding account: ${params.provider}:${params.identifier}`
            )
            const context = loadContext()
            const accountId = AiAccount.makeAccountId(
              params.provider,
              params.identifier
            )
            const now = new Date()

            if (context.hasAccount(accountId)) {
              console.log(
                `[AiAccountContext] Account already exists, updating: ${accountId}`
              )
              const updatedAccounts = context.accounts.map(account =>
                account.id === accountId
                  ? new AiAccount({
                      ...account,
                      label: params.label,
                      apiKeyPreview:
                        params.apiKeyPreview ?? account.apiKeyPreview,
                      lastUsedAt: now,
                    })
                  : account
              )

              const updatedContext = new AiAccountContext({
                ...context,
                accounts: updatedAccounts,
                activeAccountId: accountId,
                lastModified: now,
              })

              saveContext(updatedContext)
              const savedAccount = updatedContext.getAccount(accountId)!
              console.log(
                `[AiAccountContext] Account updated successfully: ${savedAccount.id}`
              )
              return savedAccount
            }

            console.log(
              `[AiAccountContext] New account, checking tier limits...`
            )
            yield* tierService.checkCanAddAiAccount(params.provider, context)

            const account = new AiAccount({
              id: accountId,
              provider: params.provider,
              label: params.label,
              apiKeyPreview: params.apiKeyPreview,
              createdAt: now,
              lastUsedAt: now,
            })

            console.log(
              `[AiAccountContext] Creating new account: ${account.id}`
            )
            const updatedContext = new AiAccountContext({
              ...context,
              accounts: [...context.accounts, account],
              activeAccountId: accountId,
              lastModified: now,
            })

            saveContext(updatedContext)
            console.log(
              `[AiAccountContext] New account created successfully: ${account.id}`
            )
            return account
          }),

        removeAccount: (accountId: AiAccountId) =>
          Effect.sync(() => {
            const context = loadContext()
            const updatedAccounts = context.accounts.filter(
              account => account.id !== accountId
            )
            const activeAccountId =
              context.activeAccountId === accountId
                ? (updatedAccounts[0]?.id ?? null)
                : context.activeAccountId

            const updatedContext = new AiAccountContext({
              ...context,
              accounts: updatedAccounts,
              activeAccountId,
              lastModified: new Date(),
            })

            saveContext(updatedContext)
          }),

        switchAccount: (accountId: AiAccountId) =>
          Effect.sync(() => {
            const context = loadContext()
            if (!context.hasAccount(accountId)) {
              return
            }
            const updatedContext = new AiAccountContext({
              ...context,
              activeAccountId: accountId,
              lastModified: new Date(),
            })
            saveContext(updatedContext)
          }),

        getActiveAccount: () =>
          Effect.sync(() => {
            const context = loadContext()
            return context.getActiveAccount()
          }),

        getAccountsByProvider: (provider: AiProviderType) =>
          Effect.sync(() => {
            const context = loadContext()
            return context.getAccountsByProvider(provider)
          }),

        touchAccount: (accountId: AiAccountId) =>
          Effect.sync(() => {
            const context = loadContext()
            const updatedAccounts = context.accounts.map(account =>
              account.id === accountId
                ? new AiAccount({
                    ...account,
                    lastUsedAt: new Date(),
                  })
                : account
            )

            const updatedContext = new AiAccountContext({
              ...context,
              accounts: updatedAccounts,
              lastModified: new Date(),
            })

            saveContext(updatedContext)
          }),

        clearAllAccounts: () =>
          Effect.sync(() => {
            saveContext(AiAccountContext.empty())
          }),
      }
    }),
  }
) {}
