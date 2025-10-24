import { Effect, Schema as S } from 'effect'
import { ipcMain } from 'electron'
import { AiProviderIpcContracts } from '../../shared/ipc-contracts'
import { AiProviderService } from '../ai/ai-provider-service'
import { mapDomainErrorToIpcError } from './error-mapper'

type ContractInput<K extends keyof typeof AiProviderIpcContracts> =
  S.Schema.Type<(typeof AiProviderIpcContracts)[K]['input']>
type ContractOutput<K extends keyof typeof AiProviderIpcContracts> =
  S.Schema.Type<(typeof AiProviderIpcContracts)[K]['output']>

export const setupAiProviderIpcHandlers = Effect.gen(function* () {
  const aiProviderService = yield* AiProviderService

  const setupHandler = <K extends keyof typeof AiProviderIpcContracts, E>(
    key: K,
    handler: (input: ContractInput<K>) => Effect.Effect<ContractOutput<K>, E>
  ) => {
    const contract = AiProviderIpcContracts[key]
    type InputSchema = S.Schema<
      ContractInput<K>,
      S.Schema.Encoded<(typeof AiProviderIpcContracts)[K]['input']>
    >
    type OutputSchema = S.Schema<
      ContractOutput<K>,
      S.Schema.Encoded<(typeof AiProviderIpcContracts)[K]['output']>
    >

    ipcMain.handle(contract.channel, async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(
          contract.input as unknown as InputSchema
        )(input)
        const result = yield* handler(validatedInput)
        const encoded = yield* S.encode(
          contract.output as unknown as OutputSchema
        )(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    })
  }

  setupHandler('aiProvider:signIn', input =>
    aiProviderService.signIn(input.provider)
  )
  setupHandler('aiProvider:signOut', input =>
    aiProviderService.signOut(input.accountId)
  )
  setupHandler('aiProvider:checkAuth', input =>
    aiProviderService.checkAuth(input.accountId)
  )
  setupHandler('aiProvider:getUsage', input =>
    aiProviderService.getUsage(input.accountId)
  )
  setupHandler('aiProvider:getProviderUsage', input =>
    aiProviderService.getUsageByProvider(input.provider)
  )
})
