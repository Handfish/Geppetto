import { Schema as S } from 'effect'
import { AiProviderType } from './provider'

export class AiAuthenticationError extends S.TaggedError<AiAuthenticationError>(
  'AiAuthenticationError'
)('AiAuthenticationError', {
  provider: AiProviderType,
  message: S.String,
}) {}

export class AiProviderUnavailableError extends S.TaggedError<AiProviderUnavailableError>(
  'AiProviderUnavailableError'
)('AiProviderUnavailableError', {
  provider: AiProviderType,
  message: S.String,
}) {}

export class AiFeatureUnavailableError extends S.TaggedError<AiFeatureUnavailableError>(
  'AiFeatureUnavailableError'
)('AiFeatureUnavailableError', {
  feature: S.String,
  tier: S.String,
  requiredTier: S.String,
  message: S.String,
}) {}

export class AiUsageUnavailableError extends S.TaggedError<AiUsageUnavailableError>(
  'AiUsageUnavailableError'
)('AiUsageUnavailableError', {
  provider: AiProviderType,
  accountId: S.String,
  message: S.String,
}) {}

export class AiUsageLimitExceededError extends S.TaggedError<AiUsageLimitExceededError>(
  'AiUsageLimitExceededError'
)('AiUsageLimitExceededError', {
  provider: AiProviderType,
  accountId: S.String,
  limit: S.optional(S.Number),
  message: S.String,
}) {}
