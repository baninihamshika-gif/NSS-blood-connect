// Leaflet's default marker icon references relative image paths that break
// under bundlers (Vite included) — this is a well-known Leaflet+bundler
// gotcha, not something specific to this project. Fix: import the marker
// images so Vite resolves/bundles them, then point Leaflet's default icon
// at those resolved URLs. Import this module once before rendering any
// Leaflet map.
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

type IconDefaultWithPrivateMethod = typeof L.Icon.Default.prototype & { _getIconUrl?: unknown }
delete (L.Icon.Default.prototype as IconDefaultWithPrivateMethod)._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})
