import { Droplet, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { DonorMatchWithBloodGroup } from '@/hooks/useDonorMatches'

const matchStatusTone = {
  PENDING: 'neutral',
  NOTIFIED: 'urgent',
  ACCEPTED: 'success',
  DECLINED: 'neutral',
  EXPIRED: 'neutral',
} as const

/**
 * Deliberately does not show the donor's name or any contact info — a match
 * is a software-suggested candidate, not a confirmed relationship. Per the
 * project's privacy rule, identity/contact details are only appropriate
 * after a donor has actually accepted (Phase 5+), matching the reference
 * UI's "Contact: Available after confirmation".
 */
export function DonorMatchCard({ match }: { match: DonorMatchWithBloodGroup }) {
  return (
    <Card className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100">
          <Droplet className="h-5 w-5 text-brand-600" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{match.bloodGroup ?? 'Unknown group'} donor</p>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {match.distance_km != null ? `${match.distance_km.toFixed(1)} km away` : 'Distance not available'}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs font-medium text-gray-500">
          {match.match_score != null ? `${match.match_score.toFixed(0)}% match relevance` : '—'}
        </span>
        <Badge tone={matchStatusTone[match.match_status as keyof typeof matchStatusTone] ?? 'neutral'}>
          {match.match_status}
        </Badge>
      </div>
    </Card>
  )
}
