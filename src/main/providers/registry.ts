import { Effect } from 'effect'
import type { ProviderType } from '../../shared/schemas/account-context'
import {
  ProviderAdapter,
  ProviderRegistryPort,
} from './ports'
import { ProviderNotRegisteredError } from './errors'
import { GitHubProviderAdapter } from '../github/provider-adapter'
import { GitLabProviderAdapter } from '../gitlab/provider-adapter'
import { BitbucketProviderAdapter } from '../bitbucket/provider-adapter'
import { GiteaProviderAdapter } from '../gitea/provider-adapter'

/**
 * Registry that exposes provider adapters to the application layer.
 */
export class ProviderRegistryService extends Effect.Service<ProviderRegistryService>()(
  'ProviderRegistryService',
  {
    dependencies: [
      GitHubProviderAdapter.Default,
      GitLabProviderAdapter.Default,
      BitbucketProviderAdapter.Default,
      GiteaProviderAdapter.Default,
    ],
    effect: Effect.gen(function* () {
      const github = yield* GitHubProviderAdapter
      const gitlab = yield* GitLabProviderAdapter
      const bitbucket = yield* BitbucketProviderAdapter
      const gitea = yield* GiteaProviderAdapter

      const map = new Map<ProviderType, ProviderAdapter>()
      ;[github, gitlab, bitbucket, gitea].forEach((adapter) => {
        map.set(adapter.provider, adapter)
      })

      return {
        getAdapter: (provider: ProviderType) =>
          Effect.gen(function* () {
            const adapter = map.get(provider)
            if (!adapter) {
              yield* Effect.fail(new ProviderNotRegisteredError({ provider }))
            }
            return adapter!
          }),

        listAdapters: (): ReadonlyArray<ProviderAdapter> => Array.from(map.values()),
      } satisfies ProviderRegistryPort
    }),
  }
) {}
