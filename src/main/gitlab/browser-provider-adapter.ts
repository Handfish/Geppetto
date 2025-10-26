import { Effect, Layer } from 'effect'
import { ProviderFeatureUnsupportedError } from '../providers/errors'
import type { VcsProviderPort } from '../providers/provider-port'
import { VcsProviderTags } from '../providers/provider-port'

const PROVIDER: 'gitlab' = 'gitlab'

/**
 * Stub adapter for GitLab integration.
 * Provides descriptive effect failures until the implementation lands.
 *
 * HEXAGONAL ARCHITECTURE: This is a STUB ADAPTER implementation of the VcsProviderPort.
 * It can be replaced with a real implementation when GitLab integration is ready.
 */

// Register the provider tag
const GitLabProviderTag = VcsProviderTags.register(PROVIDER)

const unsupported = <A>(
  feature: string
): Effect.Effect<A, ProviderFeatureUnsupportedError> =>
  Effect.fail(
    new ProviderFeatureUnsupportedError({
      provider: PROVIDER,
      feature,
    })
  )

/**
 * Stub implementation of GitLab provider adapter as a Layer.
 * This Layer provides the VcsProviderPort for GitLab (stub).
 */
export const GitLabBrowserProviderAdapter = Layer.succeed(
  GitLabProviderTag,
  {
    provider: PROVIDER,
    supportsRepositories: false,
    supportsIssues: false,
    supportsPullRequests: false,
    signIn: () => unsupported('authentication'),
    signOut: () => unsupported('authentication'),
    checkAuth: () => unsupported('authentication'),
    getRepositories: () => unsupported('repositories'),
  } satisfies VcsProviderPort
)
