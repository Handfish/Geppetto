import { Schema as S } from 'effect'
import { ProviderType } from './account-context'

export class AuthenticationError extends S.TaggedError<AuthenticationError>('AuthenticationError')(
  'AuthenticationError',
  {
    message: S.String,
  }
) {}

export class ProviderUnavailableError extends S.TaggedError<ProviderUnavailableError>('ProviderUnavailableError')(
  'ProviderUnavailableError',
  {
    provider: ProviderType,
    message: S.String,
  }
) {}

export class ProviderFeatureUnavailableError extends S.TaggedError<ProviderFeatureUnavailableError>('ProviderFeatureUnavailableError')(
  'ProviderFeatureUnavailableError',
  {
    provider: ProviderType,
    feature: S.String,
    message: S.String,
  }
) {}

export class ProviderOperationError extends S.TaggedError<ProviderOperationError>('ProviderOperationError')(
  'ProviderOperationError',
  {
    provider: ProviderType,
    message: S.String,
  }
) {}

export class NetworkError extends S.TaggedError<NetworkError>('NetworkError')(
  'NetworkError',
  {
    message: S.String,
  }
) {}

export class NotFoundError extends S.TaggedError<NotFoundError>('NotFoundError')(
  'NotFoundError',
  {
    message: S.String,
    resource: S.String,
  }
) {}
