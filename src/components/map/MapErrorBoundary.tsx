import { Component, type ReactNode } from 'react'
import { MapPinOff } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Rendered instead of the map when it fails — callers keep any non-map
   * fallback (e.g. manual lat/lng inputs) usable regardless. */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/** Catches render-time map failures (e.g. Leaflet init issues) so a broken
 * map can't take down the whole page — the feature it's embedded in (a
 * location picker, a request's donor map) stays usable via its fallback. */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Map failed to render:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
            <MapPinOff className="h-6 w-6 text-gray-400" aria-hidden="true" />
            <p className="text-sm text-gray-600">Map couldn't load. You can still use the fields below.</p>
          </div>
        )
      )
    }
    return this.props.children
  }
}
