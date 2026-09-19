import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface State {
  hasError: boolean
}

/** App-wide safety net: catches a render-time error anywhere in the routed
 * tree so an unexpected bug shows a recoverable message instead of a blank
 * white page (the exact failure mode a real Phase 9 bug hit before it was
 * fixed at the source — this doesn't replace fixing bugs, it's what stands
 * between the user and a blank screen for whichever one isn't caught yet). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Unhandled error caught by ErrorBoundary:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
          <AlertTriangle className="h-10 w-10 text-red-500" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
            <p className="mt-1 text-sm text-gray-600">
              An unexpected error occurred. Reloading the page usually fixes this.
            </p>
          </div>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </div>
      )
    }
    return this.props.children
  }
}
