/**
 * Development-only Error Testing Component
 *
 * Allows testing different error scenarios in development mode.
 * Access via window.__DEV_TRIGGER_ERROR__ in console.
 */

import React from 'react'

type ErrorType =
  | 'render-error'
  | 'async-error'
  | 'route-error'
  | 'defect'
  | 'network-error'

export class ErrorTester extends React.Component<
  { children: React.ReactNode },
  { shouldThrow: ErrorType | null }
> {
  state = { shouldThrow: null }

  componentDidMount() {
    // Expose global function for triggering errors from console
    if (process.env.NODE_ENV === 'development') {
      ;(window as any).__DEV_TRIGGER_ERROR__ = (type: ErrorType) => {
        console.log(`[ErrorTester] Triggering ${type}...`)
        this.triggerError(type)
      }

      console.log(
        '%c[ErrorTester] Error testing available!',
        'color: #10a37f; font-weight: bold'
      )
      console.log(
        '%cUse window.__DEV_TRIGGER_ERROR__(type) to trigger errors:',
        'color: #6b7280'
      )
      console.log('  - "render-error"   : Throws during render (caught by ErrorBoundary)')
      console.log('  - "async-error"    : Throws in async operation')
      console.log('  - "route-error"    : Throws route navigation error')
      console.log('  - "defect"         : Throws unexpected error')
      console.log('  - "network-error"  : Simulates network failure')
      console.log('')
      console.log('Example: window.__DEV_TRIGGER_ERROR__("render-error")')
    }
  }

  componentWillUnmount() {
    if (process.env.NODE_ENV === 'development') {
      delete (window as any).__DEV_TRIGGER_ERROR__
    }
  }

  triggerError = (type: ErrorType) => {
    switch (type) {
      case 'render-error':
        this.setState({ shouldThrow: 'render-error' })
        break
      case 'async-error':
        setTimeout(() => {
          throw new Error('Async error triggered from ErrorTester')
        }, 100)
        break
      case 'route-error':
        // Trigger route error by navigating to invalid route
        window.location.hash = '#/invalid-route-that-does-not-exist'
        break
      case 'defect':
        // Simulate an unexpected defect
        ;(null as any).someProperty
        break
      case 'network-error':
        console.error(
          '[ErrorTester] Network error simulation - check your atoms for NetworkError handling'
        )
        // This would need to be implemented in specific atoms
        alert('Network error simulation requires atom-level implementation')
        break
      default:
        console.error(`[ErrorTester] Unknown error type: ${type}`)
    }
  }

  render() {
    // Throw during render if requested
    if (this.state.shouldThrow === 'render-error') {
      throw new Error('Render error triggered from ErrorTester')
    }

    if (this.state.shouldThrow === 'defect') {
      // This will throw TypeError
      const obj: any = null
      return obj.someProperty
    }

    return this.props.children
  }
}
