import React from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

import { Alert, AlertDescription, AlertTitle } from './ui/alert'

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-6">
      <Alert className="max-w-lg bg-gray-950/85 border border-yellow-500/70 text-yellow-200 shadow-lg">
        <AlertTitle className="text-lg font-semibold uppercase tracking-wide text-yellow-300">
          Something went wrong
        </AlertTitle>
        <AlertDescription className="text-sm text-yellow-100/85">
          {message}
        </AlertDescription>
      </Alert>
    </div>
  )
}
