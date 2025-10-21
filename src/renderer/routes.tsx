import { Route } from 'react-router-dom'

import { Router } from 'lib/electron-router-dom'

import { App } from './App'

export function AppRoutes() {
  return <Router main={<Route element={<App />} path="/" />} />
}
