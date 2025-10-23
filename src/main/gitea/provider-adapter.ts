import { Effect } from 'effect'
import { ProviderFeatureUnsupportedError } from '../providers/errors'
import type { ProviderAdapter } from '../providers/ports'

/**
 * Stub adapter for Gitea integration.
 */
export class GiteaProviderAdapter extends Effect.Service<GiteaProviderAdapter>()(
  'GiteaProviderAdapter',
  {
    sync: () => {
      const provider: ProviderAdapter['provider'] = 'gitea'
      const unsupported = <A>(feature: string): Effect.Effect<A, ProviderFeatureUnsupportedError> =>
        Effect.fail(
          new ProviderFeatureUnsupportedError({
            provider,
            feature,
          })
        )

      const adapter: ProviderAdapter = {
        provider,
        supportsRepositories: false,
        supportsIssues: false,
        supportsPullRequests: false,
        signIn: () => unsupported('authentication'),
        signOut: () => unsupported('authentication'),
        checkAuth: () => unsupported('authentication'),
        getRepositories: () => unsupported('repositories'),
      }

      return adapter
    },
  }
) {}
