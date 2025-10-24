const CONSOLE_ERROR_STORAGE_KEY = 'geppetto:console-error'

type ConsoleErrorPayload = {
  message: string
  timestamp: number
}

const isConsoleErrorPayload = (
  value: unknown
): value is ConsoleErrorPayload => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.message === 'string' &&
    candidate.message.length > 0 &&
    typeof candidate.timestamp === 'number'
  )
}

export const readConsoleError = (): ConsoleErrorPayload | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(CONSOLE_ERROR_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isConsoleErrorPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const writeConsoleError = (message: string | null) => {
  if (typeof window === 'undefined') {
    return
  }

  if (!message) {
    window.localStorage.removeItem(CONSOLE_ERROR_STORAGE_KEY)
    return
  }

  const payload: ConsoleErrorPayload = {
    message,
    timestamp: Date.now(),
  }

  try {
    window.localStorage.setItem(
      CONSOLE_ERROR_STORAGE_KEY,
      JSON.stringify(payload)
    )
  } catch {
    // Ignore storage quota errors for console diagnostics
  }
}

export const clearConsoleError = () => writeConsoleError(null)

export const CONSOLE_ERROR_KEY = CONSOLE_ERROR_STORAGE_KEY

export type { ConsoleErrorPayload }
