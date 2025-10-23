import { Effect, Schema as S } from 'effect'
import { ipcMain } from 'electron'
import { ProviderIpcContracts } from '../../shared/ipc-contracts'
import { VcsProviderService } from '../providers/vcs-provider-service'
import { mapDomainErrorToIpcError } from './error-mapper'

type ContractInput<K extends keyof typeof ProviderIpcContracts> = S.Schema.Type<
  (typeof ProviderIpcContracts)[K]['input']
>
type ContractOutput<K extends keyof typeof ProviderIpcContracts> = S.Schema.Type<
  (typeof ProviderIpcContracts)[K]['output']
>

export const setupProviderIpcHandlers = Effect.gen(function* () {
  const providerService = yield* VcsProviderService

  const setupHandler = <K extends keyof typeof ProviderIpcContracts, E>(
    key: K,
    handler: (input: ContractInput<K>) => Effect.Effect<ContractOutput<K>, E>
  ) => {
    const contract = ProviderIpcContracts[key]
    type InputSchema = S.Schema<
      ContractInput<K>,
      S.Schema.Encoded<typeof ProviderIpcContracts[K]['input']>
    >
    type OutputSchema = S.Schema<
      ContractOutput<K>,
      S.Schema.Encoded<typeof ProviderIpcContracts[K]['output']>
    >

    ipcMain.handle(contract.channel, async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(contract.input as unknown as InputSchema)(input)
        const result = yield* handler(validatedInput)
        const encoded = yield* S.encode(contract.output as unknown as OutputSchema)(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    })
  }

  setupHandler('signIn', (input) => providerService.signIn(input.provider))
  setupHandler('signOut', (input) => providerService.signOut(input.accountId))
  setupHandler('checkAuth', (input) => providerService.checkAuth(input.accountId))
  setupHandler('getAccountRepositories', (input) =>
    providerService.getRepositories(input.accountId)
  )
  setupHandler('getProviderRepositories', (input) =>
    providerService.getRepositoriesByProvider(input.provider)
  )
})
