import '@/lib/leafletSetup'
import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary'
import { EmptyState } from '@/components/ui/EmptyState'
import { MapIcon } from 'lucide-react'
import type { DonorMatchWithBloodGroup } from '@/hooks/useDonorMatches'

const legendColor: Record<string, string> = {
  ACCEPTED: '#16a34a', // green — confirmed
  NOTIFIED: '#ea580c', // orange — awaiting response
  PENDING: '#ea580c', // orange — awaiting response
  DECLINED: '#9ca3af', // gray — no longer active
  EXPIRED: '#9ca3af', // gray — no longer active
}

function dotIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.2)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

const requestIcon = L.divIcon({
  className: '',
  html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#dc2626;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.3)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

// Donors can be far from the request (a real 205km case surfaced this in testing),
// so a fixed zoom/center can leave pins silently off-screen. Fit the viewport to
// every known point instead of guessing a zoom level.
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  // points is a fresh array every render; key the effect on its content so a
  // realtime-triggered re-render with the same coordinates doesn't undo the
  // user's manual pan/zoom by re-fitting on every render.
  const pointsKey = points.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0]!, 12)
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pointsKey])
  return null
}

export function RequestMap({
  requestLocation,
  matches,
}: {
  requestLocation: { lat: number; lng: number } | null
  matches: DonorMatchWithBloodGroup[]
}) {
  const donorPins = matches.filter((m) => m.approxLat != null && m.approxLng != null)

  if (!requestLocation && donorPins.length === 0) {
    return (
      <EmptyState
        icon={MapIcon}
        title="No location data yet"
        description="Add an approximate location to this request, or wait for a matched donor who has set one on their profile."
      />
    )
  }

  const center = requestLocation ?? { lat: donorPins[0]!.approxLat!, lng: donorPins[0]!.approxLng! }
  const allPoints: [number, number][] = [
    ...(requestLocation ? [[requestLocation.lat, requestLocation.lng] as [number, number]] : []),
    ...donorPins.map((m): [number, number] => [m.approxLat!, m.approxLng!]),
  ]

  return (
    <div>
      <MapErrorBoundary>
        <div className="h-64 overflow-hidden rounded-xl border border-gray-200">
          <MapContainer center={[center.lat, center.lng]} zoom={11} style={{ height: '100%', width: '100%' }}>
            <FitBounds points={allPoints} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {requestLocation && (
              <Marker position={[requestLocation.lat, requestLocation.lng]} icon={requestIcon}>
                <Popup>Request location</Popup>
              </Marker>
            )}
            {donorPins.map((m) => (
              <Marker
                key={m.id}
                position={[m.approxLat!, m.approxLng!]}
                icon={dotIcon(legendColor[m.match_status] ?? legendColor.PENDING!)}
              >
                <Popup>
                  {m.bloodGroup ?? 'Unknown group'} donor — {m.match_status}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </MapErrorBoundary>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Request location
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600" /> Accepted
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-600" /> Notified / pending
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> Declined / expired
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Donor positions are approximate (~100m), never exact addresses.
      </p>
    </div>
  )
}
