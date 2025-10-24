import React from 'react'
import { Toaster } from 'sonner'

const getWindowId = () => {
  if (typeof window === 'undefined') {
    return 'main'
  }
  const selectAllSlashes = /\//g
  const rawId =
    window.location.hash.split(selectAllSlashes)?.[1]?.toLowerCase() ?? 'main'
  return rawId.split('?')[0] || 'main'
}

export function ToastViewport() {
  const isMainWindow = React.useMemo(() => getWindowId() === 'main', [])

  if (!isMainWindow) {
    return null
  }

  return (
    <Toaster
      offset={{ top: 32, left: 500 }}
      position="top-left"
      toastOptions={{
        duration: 6000,
        unstyled: true,
      }}
    />
  )
}
