import { Route } from 'react-router-dom'

import { Router } from 'lib/electron-router-dom'

import { App } from './App'
import { MainScreen } from './screens/main'
import { RouteErrorFallback } from './components/RouteErrorFallback'
import { ConsoleErrorBoundary } from './components/ConsoleErrorBoundary'

export function AppRoutes() {
  return (
    <Router
      main={
        <Route
          element={<MainScreen />}
          errorElement={<RouteErrorFallback />}
          path="/"
        />
      }
      console={
        <Route
          element={
            <ConsoleErrorBoundary>
              <App />
            </ConsoleErrorBoundary>
          }
          path="/"
        />
      }
    />
  )
}
