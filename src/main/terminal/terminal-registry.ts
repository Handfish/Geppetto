import { Effect, Layer } from 'effect'
import { TerminalPort } from './terminal-port'

// Registry service that provides access to the terminal adapter
export class TerminalRegistry extends Effect.Service<TerminalRegistry>()(
  'TerminalRegistry',
  {
    effect: Effect.gen(function* () {
      // Capture the TerminalPort adapter at construction
      const adapter = yield* TerminalPort

      const getDefaultAdapter = () => Effect.succeed(adapter)

      return {
        getDefaultAdapter,
      }
    }),
    dependencies: [],
  }
) {}
