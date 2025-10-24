import React from 'react'
import {
  clearConsoleError,
  writeConsoleError,
} from '../lib/console-error-channel'
import { ErrorAlert } from './ui/ErrorAlert'

type ConsoleErrorBoundaryProps = {
  children: React.ReactNode
}

type ConsoleErrorBoundaryState = {
  error: Error | null
  errorCount: number
  isRecovering: boolean
  secondsUntilRecovery: number
}

const AUTO_RECOVERY_DELAY_MS = 8000
const ERROR_LOOP_THRESHOLD = 3

export class ConsoleErrorBoundary extends React.Component<
  ConsoleErrorBoundaryProps,
  ConsoleErrorBoundaryState
> {
  state: ConsoleErrorBoundaryState = {
    error: null,
    errorCount: 0,
    isRecovering: false,
    secondsUntilRecovery: 8,
  }

  private recoveryTimeoutId: NodeJS.Timeout | null = null
  private countdownIntervalId: NodeJS.Timeout | null = null
  private navigationListener: (() => void) | null = null

  static getDerivedStateFromError(error: Error) {
    return {
      error,
      isRecovering: false,
      secondsUntilRecovery: 8,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const message = error?.message ?? 'Renderer error encountered.'
    writeConsoleError(message)

    // eslint-disable-next-line no-console
    console.error('[ConsoleErrorBoundary]', error, errorInfo)

    // Increment error count
    this.setState(prevState => ({
      errorCount: prevState.errorCount + 1,
    }))

    // Only auto-recover if not in error loop
    // Use setTimeout to ensure state update has completed
    setTimeout(() => {
      if (this.state.errorCount <= ERROR_LOOP_THRESHOLD) {
        this.scheduleAutoRecovery()
      }
    }, 0)

    // Listen for route changes to auto-recover
    this.setupNavigationListener()
  }

  componentWillUnmount(): void {
    this.clearRecoveryTimeout()
    this.clearCountdownInterval()
    this.removeNavigationListener()
    clearConsoleError()
  }

  scheduleAutoRecovery() {
    // Clear existing timeout and interval
    this.clearRecoveryTimeout()
    this.clearCountdownInterval()

    // Start countdown interval
    this.countdownIntervalId = setInterval(() => {
      this.setState(prevState => ({
        secondsUntilRecovery: Math.max(0, prevState.secondsUntilRecovery - 1),
      }))
    }, 1000)

    // Schedule auto-recovery
    this.recoveryTimeoutId = setTimeout(() => {
      this.setState({ isRecovering: true })

      // Wait for transition animation
      setTimeout(() => {
        this.handleRetry()
      }, 500)
    }, AUTO_RECOVERY_DELAY_MS)
  }

  clearRecoveryTimeout() {
    if (this.recoveryTimeoutId) {
      clearTimeout(this.recoveryTimeoutId)
      this.recoveryTimeoutId = null
    }
  }

  clearCountdownInterval() {
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId)
      this.countdownIntervalId = null
    }
  }

  setupNavigationListener() {
    // Auto-recover on navigation
    this.navigationListener = () => {
      this.handleRetry()
    }
    window.addEventListener('hashchange', this.navigationListener)
    window.addEventListener('popstate', this.navigationListener)
  }

  removeNavigationListener() {
    if (this.navigationListener) {
      window.removeEventListener('hashchange', this.navigationListener)
      window.removeEventListener('popstate', this.navigationListener)
      this.navigationListener = null
    }
  }

  handleRetry = () => {
    this.clearRecoveryTimeout()
    this.clearCountdownInterval()
    this.removeNavigationListener()
    clearConsoleError()

    // If error occurs repeatedly (>threshold), don't auto-recover
    if (this.state.errorCount > ERROR_LOOP_THRESHOLD) {
      // eslint-disable-next-line no-console
      console.error(
        '[ConsoleErrorBoundary] Error loop detected, not auto-recovering'
      )
      return
    }

    this.setState({
      error: null,
      isRecovering: false,
      secondsUntilRecovery: 8,
    })
  }

  render() {
    if (this.state.error) {
      const { error, errorCount, isRecovering, secondsUntilRecovery } =
        this.state

      // Error loop detected - show persistent error
      if (errorCount > ERROR_LOOP_THRESHOLD) {
        return (
          <div className="p-6">
            <div className="max-w-2xl bg-gray-800 rounded-lg p-6 border border-gray-700">
              <ErrorAlert
                title="Critical Error"
                message="Multiple errors detected. Please refresh the application."
                action={
                  <button
                    className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                    onClick={() => window.location.reload()}
                    type="button"
                  >
                    Reload Application
                  </button>
                }
              />
              {process.env.NODE_ENV === 'development' && (
                <details className="mt-4 text-sm text-gray-400">
                  <summary className="cursor-pointer hover:text-gray-300">
                    Stack Trace
                  </summary>
                  <pre className="mt-2 p-4 bg-gray-900 rounded overflow-x-auto text-xs select-text border border-gray-700">
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )
      }

      // Show error with auto-recovery countdown
      return (
        <div className="p-6">
          <div
            className={`max-w-2xl bg-gray-800 rounded-lg p-6 border border-gray-700 transition-opacity duration-500 ${
              isRecovering ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <ErrorAlert
              title="Application Error"
              message={error.message || 'Something went wrong'}
              action={
                <div className="flex gap-4 items-center">
                  <button
                    className="px-4 py-2 border border-red-400/60 rounded-md text-red-200 hover:bg-red-500/10 transition-colors"
                    onClick={this.handleRetry}
                    type="button"
                  >
                    Dismiss Now
                  </button>
                  <span className="text-sm text-red-200/80">
                    Auto-recovering in {secondsUntilRecovery}s...
                  </span>
                </div>
              }
            />

            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 text-sm text-gray-400">
                <summary className="cursor-pointer hover:text-gray-300">
                  Stack Trace (Development)
                </summary>
                <pre className="mt-2 p-4 bg-gray-900 rounded overflow-x-auto text-xs select-text border border-gray-700">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
