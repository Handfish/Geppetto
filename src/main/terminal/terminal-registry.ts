import { Effect, Layer, HashMap } from 'effect'
import { TerminalPort, TerminalAdapterType, TerminalAdapterTag } from './terminal-port'

// Registry service that captures all adapters at construction time
export class TerminalRegistry extends Effect.Service<TerminalRegistry>()(
  'TerminalRegistry',
  {
    effect: Effect.gen(function* () {
      // Capture the TerminalPort adapter at construction
      const adapter = yield* TerminalPort

      // For now we only have one adapter, but this allows future expansion
      const adapters = HashMap.make<TerminalAdapterType, TerminalPort>([
        [TerminalAdapterTag.NodePty, adapter],
      ])

      const getAdapter = (type: TerminalAdapterType) => Effect.gen(function* () {
        const adapterOption = HashMap.get(adapters, type)
        if (adapterOption._tag === 'None') {
          return yield* Effect.fail(new Error(`Terminal adapter ${type} not found`))
        }
        return adapterOption.value
      })

      const getDefaultAdapter = () => Effect.succeed(adapter)

      return {
        getAdapter,
        getDefaultAdapter,
        listAdapters: () => Effect.succeed(Array.from(HashMap.keys(adapters))),
      }
    }),
    dependencies: [TerminalPort],
  }
) {}
