import { Link } from 'react-router-dom'
import { Droplet, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { priorityTone } from '@/lib/utilities/requestDisplay'
import type { IncomingMatch } from '@/hooks/useIncomingMatches'

const matchStatusTone = {
  PENDING: 'neutral',
  NOTIFIED: 'urgent',
  ACCEPTED: 'success',
  DECLINED: 'neutral',
  EXPIRED: 'neutral',
} as const

export function IncomingMatchCard({ match }: { match: IncomingMatch }) {
  const request = match.blood_requests
  return (
    <Link
      to={`/donor/matches/${match.id}`}
      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100">
          <Droplet className="h-5 w-5 text-brand-600" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {request.blood_group} · {request.units_required} unit{request.units_required === 1 ? '' : 's'}
          </p>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            {request.hospital_name ? (
              <>
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {request.hospital_name}
              </>
            ) : (
              'No facility specified'
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={priorityTone[request.priority]}>{request.priority}</Badge>
        <Badge tone={matchStatusTone[match.match_status]}>{match.match_status}</Badge>
      </div>
    </Link>
  )
}
