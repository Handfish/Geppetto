import { Route } from 'react-router-dom'

import { Router } from 'lib/electron-router-dom'

import { App } from './App'
import { MainScreen } from './screens/main'

export function AppRoutes() {
  return (
    <Router
      main={<Route element={<MainScreen />} path="/" />}
      console={<Route element={<App />} path="/" />}
    />
  )
}
