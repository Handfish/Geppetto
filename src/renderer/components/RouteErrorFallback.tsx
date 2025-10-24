import React from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

import { ErrorAlert } from './ui/ErrorAlert'

export function RouteErrorFallback() {
  const error = useRouteError()

  const message = React.useMemo(() => {
    if (!error) return 'Something went wrong while rendering this screen.'

    if (isRouteErrorResponse(error)) {
      return (
        error.statusText || 'Something went wrong while rendering this screen.'
      )
    }

    if (error instanceof Error) {
      return (
        error.message || 'Something went wrong while rendering this screen.'
      )
    }

    if (typeof error === 'string') {
      return error
    }

    return 'Something went wrong while rendering this screen.'
  }, [error])

  const stack =
    process.env.NODE_ENV === 'development' && error instanceof Error
      ? error.stack
      : undefined

  return (
    <div className="p-6">
      <div className="max-w-2xl bg-gray-800 rounded-lg p-6 border border-gray-700">
        <ErrorAlert
          title="Route Error"
          message={message}
          action={
            <div className="mt-4 flex gap-3">
              <button
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors"
                onClick={() => window.location.reload()}
                type="button"
              >
                Reload Application
              </button>
              <button
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded hover:bg-gray-800 transition-colors"
                onClick={() => window.history.back()}
                type="button"
              >
                Go Back
              </button>
            </div>
          }
        />
        {stack && (
          <details className="mt-4 text-sm text-gray-400">
            <summary className="cursor-pointer hover:text-gray-300">
              Stack Trace (Development)
            </summary>
            <pre className="mt-2 p-4 bg-gray-900 rounded overflow-x-auto text-xs select-text border border-gray-700">
              {stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
