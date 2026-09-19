import '@/lib/leafletSetup'
import { useState } from 'react'
import type L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import { Crosshair, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary'

export interface LatLng {
  lat: number
  lng: number
}

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629] // geographic center of India — a neutral default, not a claim about the user
const DEFAULT_ZOOM = 5
const SELECTED_ZOOM = 12

/** Rounds to 3 decimal places (~111m at the equator) — matches the
 * database's approx_lat/approx_lng precision, and is the point where we
 * commit to "approximate," not exact GPS. */
function roundApprox(n: number): number {
  return Math.round(n * 1000) / 1000
}

function ClickToSetMarker({ onSelect }: { onSelect: (pos: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: roundApprox(e.latlng.lat), lng: roundApprox(e.latlng.lng) })
    },
  })
  return null
}

export function LocationPicker({
  value,
  onChange,
  label = 'Approximate location',
}: {
  value: LatLng | null
  onChange: (value: LatLng | null) => void
  label?: string
}) {
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not available in this browser.')
      return
    }
    setGeoError(null)
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({ lat: roundApprox(position.coords.latitude), lng: roundApprox(position.coords.longitude) })
        setGeoLoading(false)
      },
      (err) => {
        setGeoError(err.message || 'Could not get your location.')
        setGeoLoading(false)
      },
      { timeout: 10_000 },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation} isLoading={geoLoading}>
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            Use my location
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {geoError && <p className="text-sm text-red-600">{geoError}</p>}

      <MapErrorBoundary>
        <div className="h-56 overflow-hidden rounded-lg border border-gray-300">
          <MapContainer
            center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
            zoom={value ? SELECTED_ZOOM : DEFAULT_ZOOM}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickToSetMarker onSelect={onChange} />
            {value && (
              <Marker
                position={[value.lat, value.lng]}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target as L.Marker
                    const pos = marker.getLatLng()
                    onChange({ lat: roundApprox(pos.lat), lng: roundApprox(pos.lng) })
                  },
                }}
              />
            )}
          </MapContainer>
        </div>
      </MapErrorBoundary>

      <p className="text-xs text-gray-500">
        Click the map, drag the pin, or use your current location. Stored at reduced precision
        (~100m) — never your exact address.
      </p>

      {/* Manual fallback — stays usable even if the map above fails to render. */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Latitude"
          type="number"
          step="0.001"
          value={value?.lat ?? ''}
          onChange={(e) => {
            const lat = e.target.value === '' ? null : Number(e.target.value)
            if (lat === null) return onChange(null)
            onChange({ lat: roundApprox(lat), lng: value?.lng ?? 0 })
          }}
        />
        <Input
          label="Longitude"
          type="number"
          step="0.001"
          value={value?.lng ?? ''}
          onChange={(e) => {
            const lng = e.target.value === '' ? null : Number(e.target.value)
            if (lng === null) return onChange(null)
            onChange({ lat: value?.lat ?? 0, lng: roundApprox(lng) })
          }}
        />
      </div>
    </div>
  )
}
