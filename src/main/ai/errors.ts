import { Data } from 'effect'
import type { AiProviderType, AiAccountId } from '../../shared/schemas/ai/provider'

export class AiProviderNotRegisteredError extends Data.TaggedError(
  'AiProviderNotRegisteredError'
)<{
  provider: AiProviderType
}> {}

export class AiProviderAuthenticationError extends Data.TaggedError(
  'AiProviderAuthenticationError'
)<{
  provider: AiProviderType
  message: string
}> {}

export class AiProviderFeatureUnsupportedError extends Data.TaggedError(
  'AiProviderFeatureUnsupportedError'
)<{
  provider: AiProviderType
  feature: string
}> {}

export class AiProviderUsageError extends Data.TaggedError('AiProviderUsageError')<{
  provider: AiProviderType
  accountId: AiAccountId
  message: string
}> {}

export class AiAccountNotFoundError extends Data.TaggedError('AiAccountNotFoundError')<{
  accountId: AiAccountId
  provider: AiProviderType
}> {}
