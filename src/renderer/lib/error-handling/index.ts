/**
 * Error Handling Module - Hexagonal Architecture
 *
 * Exports:
 * - Ports (interfaces): ErrorPresenter, ErrorRecovery
 * - Adapters: ToastErrorPresenter, ErrorRecovery strategies
 * - Utilities: withErrorHandling, withErrorHandlingFactory
 * - Formatters: Error message formatting for users and developers
 */

// Ports
export type { ErrorPresenter, ErrorRecovery, ErrorContext } from './ports'

// Toast Error Presenter (default)
export {
  ToastErrorPresenter,
  defaultErrorPresenter,
} from './adapters/toast-error-presenter'

// Error Recovery Strategies
export {
  RetryErrorRecovery,
  FallbackErrorRecovery,
  LoggingErrorRecovery,
  ConditionalErrorRecovery,
} from './adapters/error-recovery'

// Utilities
export {
  withErrorHandling,
  withErrorHandlingFactory,
  type WithErrorHandlingOptions,
} from './with-error-handling'

// Formatters
export {
  formatErrorForUser,
  formatErrorForDeveloper,
  getRecoveryHint,
  requiresUserAction,
  isTransientError,
} from './formatters'
