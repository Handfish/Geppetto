import { Schema as S } from 'effect'

export class AuthenticationError extends S.TaggedError<AuthenticationError>('AuthenticationError')(
  'AuthenticationError',
  {
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

