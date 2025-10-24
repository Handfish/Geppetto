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
      closeButton
      offset={{ top: 144, left: 32 }}
      position="top-left"
      theme="dark"
      toastOptions={{
        duration: 6000,
        unstyled: false,
        classNames: {
          toast:
            'pointer-events-auto w-[320px] rounded-xl shadow-2xl backdrop-blur-md border',
          title: 'text-sm font-semibold uppercase tracking-wide',
          description: 'text-sm opacity-90',
          closeButton: 'hover:opacity-80',
          success:
            'bg-gray-950/90 border-teal-500/80 text-teal-100 [&_[data-title]]:text-teal-200 [&_[data-description]]:text-teal-100/85',
          error:
            'bg-gray-950/90 border-yellow-500/80 text-yellow-100 [&_[data-title]]:text-yellow-200 [&_[data-description]]:text-yellow-100/85',
          info: 'bg-gray-950/90 border-blue-500/80 text-blue-100 [&_[data-title]]:text-blue-200 [&_[data-description]]:text-blue-100/85',
          warning:
            'bg-gray-950/90 border-orange-500/80 text-orange-100 [&_[data-title]]:text-orange-200 [&_[data-description]]:text-orange-100/85',
        },
      }}
    />
  )
}
