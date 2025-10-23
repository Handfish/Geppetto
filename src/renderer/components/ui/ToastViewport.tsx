import React from 'react'
import { Toaster } from 'sonner'

const getWindowId = () => {
  if (typeof window === 'undefined') {
    return 'main'
  }
  const selectAllSlashes = /\//g
  const rawId = window.location.hash.split(selectAllSlashes)?.[1]?.toLowerCase() ?? 'main'
  return rawId.split('?')[0] || 'main'
}

export function ToastViewport() {
  const isMainWindow = React.useMemo(() => getWindowId() === 'main', [])

  if (!isMainWindow) {
    return null
  }

  return (
    <Toaster
      position="top-left"
      theme="dark"
      closeButton
      offset={{ top: 144, left: 32 }}
      toastOptions={{
        duration: 6000,
        className:
          'pointer-events-auto w-[320px] rounded-xl border border-yellow-500/80 bg-gray-950/90 text-yellow-100 shadow-2xl backdrop-blur-md',
        classNames: {
          title: 'text-sm font-semibold uppercase tracking-wide text-yellow-200',
          description: 'text-sm text-yellow-100/85',
        },
      }}
    />
  )
}
