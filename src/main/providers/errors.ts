import { Data } from 'effect'
import type { ProviderType } from '../../shared/schemas/account-context'

export class ProviderNotRegisteredError extends Data.TaggedError(
  'ProviderNotRegisteredError'
)<{
  provider: ProviderType
}> {}

export class ProviderFeatureUnsupportedError extends Data.TaggedError(
  'ProviderFeatureUnsupportedError'
)<{
  provider: ProviderType
  feature: string
}> {}

export class ProviderAuthenticationError extends Data.TaggedError(
  'ProviderAuthenticationError'
)<{
  provider: ProviderType
  message: string
}> {}

export class ProviderRepositoryError extends Data.TaggedError(
  'ProviderRepositoryError'
)<{
  provider: ProviderType
  message: string
}> {}
