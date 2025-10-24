import React from 'react'
import {
  clearConsoleError,
  writeConsoleError,
} from '../lib/console-error-channel'

type ConsoleErrorBoundaryProps = {
  children: React.ReactNode
}

type ConsoleErrorBoundaryState = {
  error: Error | null
}

export class ConsoleErrorBoundary extends React.Component<
  ConsoleErrorBoundaryProps,
  ConsoleErrorBoundaryState
> {
  state: ConsoleErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    const message = error?.message ?? 'Renderer error encountered.'
    writeConsoleError(message)
    // eslint-disable-next-line no-console
    console.error('[ConsoleErrorBoundary]', error)
  }

  componentWillUnmount(): void {
    clearConsoleError()
  }

  handleRetry = () => {
    clearConsoleError()
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-950 p-6 text-red-400">
          <div className="mx-auto max-w-4xl space-y-4">
            <h1 className="text-xl font-semibold text-red-300">
              Renderer error
            </h1>
            <p className="text-sm text-red-200/80">
              {this.state.error.message ||
                'Something went wrong in the developer console.'}
            </p>
            <button
              className="rounded-md border border-red-400/60 px-3 py-1 text-sm font-medium text-red-200 transition hover:bg-red-500/10"
              onClick={this.handleRetry}
              type="button"
            >
              Dismiss and continue
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
