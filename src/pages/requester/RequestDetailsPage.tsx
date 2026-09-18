import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Droplet, MapPin, Search, Users } from 'lucide-react'
import { useBloodRequestDetails } from '@/hooks/useBloodRequestDetails'
import { useFindMatches } from '@/hooks/useFindMatches'
import { useDonorMatches } from '@/hooks/useDonorMatches'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyState } from '@/components/ui/EmptyState'
import { DonorMatchCard } from '@/components/matching/DonorMatchCard'
import { priorityTone, statusLabel, statusTone } from '@/lib/utilities/requestDisplay'
import type { RequestStatus } from '@/types/database'

const CLOSED_STATUSES: RequestStatus[] = ['COMPLETED', 'CANCELLED', 'EXPIRED', 'FULFILLED']

function formatUtcTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function MatchingSection({ requestId, requestStatus }: { requestId: string; requestStatus: RequestStatus }) {
  const findMatches = useFindMatches(requestId)
  const { data: matches, isLoading, isError } = useDonorMatches(requestId)
  const [findError, setFindError] = useState<string | null>(null)
  const canMatch = !CLOSED_STATUSES.includes(requestStatus)

  const onFindMatches = async () => {
    setFindError(null)
    try {
      await findMatches.mutateAsync()
    } catch (err) {
      setFindError(err instanceof Error ? err.message : 'Could not run donor matching. Please try again.')
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Matched Donors</h2>
        {canMatch && (
          <Button size="sm" onClick={onFindMatches} isLoading={findMatches.isPending}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Find Matching Donors
          </Button>
        )}
      </div>

      {findError && <ErrorMessage message={findError} />}

      {findMatches.isSuccess && !findError && (
        <p className="mb-3 text-sm text-gray-600">
          Considered {findMatches.data.candidatesConsidered} eligible candidate(s) — {findMatches.data.matchCount}{' '}
          matched.
        </p>
      )}

      {isLoading && <Spinner label="Loading matches…" />}
      {isError && <ErrorMessage message="Could not load matches. Please refresh." />}
      {!isLoading && !isError && (!matches || matches.length === 0) && (
        <EmptyState
          icon={Users}
          title="No matched donors yet"
          description="Run donor matching to find eligible candidates. Matches are software-suggested and don't imply medical certainty — contact details are only shared after a donor confirms (coming in a later phase)."
        />
      )}
      {!isLoading && !isError && matches && matches.length > 0 && (
        <div className="flex flex-col gap-2">
          {matches.map((match) => (
            <DonorMatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  )
}

export function RequestDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const { data: request, isLoading, isError } = useBloodRequestDetails(id)

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-4">
      <Link to="/requester/requests" className="inline-flex w-fit items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to request history
      </Link>

      {isLoading && <Spinner label="Loading request…" />}
      {isError && <ErrorMessage message="Could not load this request. Please refresh." />}
      {!isLoading && !isError && !request && (
        <EmptyState title="Request not found" description="This request doesn't exist or isn't yours." />
      )}

      {!isLoading && !isError && request && (
        <>
          <Card className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100">
                  <Droplet className="h-6 w-6 text-brand-600" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">
                    {request.blood_group} · {request.units_required} unit{request.units_required === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Request #{request.id.slice(0, 8)}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={priorityTone[request.priority]}>{request.priority}</Badge>
                <Badge tone={statusTone[request.status]}>{statusLabel[request.status]}</Badge>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Hospital</dt>
                <dd className="text-sm font-medium text-gray-900">{request.hospital_name ?? 'Not specified'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Facility</dt>
                <dd className="text-sm font-medium text-gray-900">{request.facility_name ?? 'Not specified'}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500">
                  <MapPin className="h-3 w-3" aria-hidden="true" /> Location
                </dt>
                <dd className="text-sm font-medium text-gray-900">{request.location_area ?? 'Not specified'}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500">
                  <Calendar className="h-3 w-3" aria-hidden="true" /> Required by
                </dt>
                <dd className="text-sm font-medium text-gray-900">
                  {request.required_date
                    ? `${request.required_date}${request.required_time ? ` at ${request.required_time}` : ''}`
                    : 'Not specified'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Type</dt>
                <dd className="text-sm font-medium text-gray-900">{request.request_type}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Created</dt>
                <dd className="text-sm font-medium text-gray-900">{formatUtcTimestamp(request.created_at)}</dd>
              </div>
            </dl>

            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              Donor responses and a full status timeline aren't live yet — matching is, so this request can already
              find eligible candidates below.
            </div>
          </Card>

          <MatchingSection requestId={request.id} requestStatus={request.status} />
        </>
      )}
    </div>
  )
}
