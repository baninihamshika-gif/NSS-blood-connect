import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Calendar, CheckCircle2, Droplet, MapPin, Search, Users, XCircle } from 'lucide-react'
import { useBloodRequestDetails } from '@/hooks/useBloodRequestDetails'
import { useFindMatches } from '@/hooks/useFindMatches'
import { useEmergencyCascade } from '@/hooks/useEmergencyCascade'
import { useDonorMatches } from '@/hooks/useDonorMatches'
import { useRequestStatusHistory } from '@/hooks/useRequestStatusHistory'
import { useUpdateRequestStatus } from '@/hooks/useUpdateRequestStatus'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyState } from '@/components/ui/EmptyState'
import { DonorMatchCard } from '@/components/matching/DonorMatchCard'
import { RequestTimeline } from '@/components/requests/RequestTimeline'
import { RequestMap } from '@/components/map/RequestMap'
import { priorityTone, statusLabel, statusTone } from '@/lib/utilities/requestDisplay'
import type { RequestStatus, RequestType } from '@/types/database'

const CLOSED_STATUSES: RequestStatus[] = ['COMPLETED', 'CANCELLED', 'EXPIRED', 'FULFILLED']
const CANCELLABLE_STATUSES: RequestStatus[] = ['CREATED', 'MATCHING', 'CONTACTING_DONORS', 'PARTIALLY_FULFILLED', 'FULFILLED']
const COMPLETABLE_STATUSES: RequestStatus[] = ['FULFILLED', 'PARTIALLY_FULFILLED']

function formatUtcTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function RequestActions({ requestId, requestStatus }: { requestId: string; requestStatus: RequestStatus }) {
  const updateStatus = useUpdateRequestStatus(requestId)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'CANCELLED' | 'COMPLETED' | null>(null)

  const canCancel = CANCELLABLE_STATUSES.includes(requestStatus)
  const canComplete = COMPLETABLE_STATUSES.includes(requestStatus)
  if (!canCancel && !canComplete) return null

  const onAction = async (status: 'CANCELLED' | 'COMPLETED') => {
    setError(null)
    setPending(status)
    try {
      await updateStatus.mutateAsync(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this request. Please try again.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <ErrorMessage message={error} />}
      <div className="flex gap-2">
        {canComplete && (
          <Button
            variant="primary"
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            isLoading={pending === 'COMPLETED'}
            disabled={updateStatus.isPending && pending !== 'COMPLETED'}
            onClick={() => onAction('COMPLETED')}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Mark Completed
          </Button>
        )}
        {canCancel && (
          <Button
            variant="outline"
            size="sm"
            isLoading={pending === 'CANCELLED'}
            disabled={updateStatus.isPending && pending !== 'CANCELLED'}
            onClick={() => onAction('CANCELLED')}
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Cancel Request
          </Button>
        )}
      </div>
    </div>
  )
}

const CASCADE_REASON_MESSAGE: Record<string, string> = {
  fulfilled: 'All units confirmed — no further search needed.',
  closed: 'This request is no longer active.',
  exhausted: 'Every search radius has been tried without full fulfillment. You can cancel, wait for more responses, or keep the request open in case a donor becomes available later.',
}

function EmergencySearchControl({ requestId, cascadeTierIndex }: { requestId: string; cascadeTierIndex: number | null }) {
  const cascade = useEmergencyCascade(requestId)
  const [error, setError] = useState<string | null>(null)

  const onRun = async () => {
    setError(null)
    try {
      await cascade.mutateAsync()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the emergency search. Please try again.')
    }
  }

  // Reflects actual server-side progress (cascade_tier_index on the
  // request), not just this session's mutation state — otherwise a page
  // reload after already running the cascade would misleadingly offer
  // "Activate" again instead of "Continue."
  const alreadyStarted = cascadeTierIndex !== null || Boolean(cascade.data)

  return (
    <div className="flex flex-col gap-2">
      <Button variant="danger" size="sm" onClick={onRun} isLoading={cascade.isPending} className="w-fit">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {alreadyStarted ? 'Continue Emergency Search' : 'Activate Emergency Search'}
      </Button>
      {error && <ErrorMessage message={error} />}
      {cascade.data && (
        <p className="text-sm text-gray-600">
          {cascade.data.done
            ? (CASCADE_REASON_MESSAGE[cascade.data.reason ?? ''] ?? 'Search stopped.')
            : `Wave ${(cascade.data.wave ?? 0) + 1}: expanded to ${cascade.data.radiusKm} km, notified ${cascade.data.newMatches} new donor(s).`}
          {cascade.data.timedOutExpired > 0 &&
            ` (${cascade.data.timedOutExpired} unresponsive match${cascade.data.timedOutExpired === 1 ? '' : 'es'} timed out and freed up.)`}
        </p>
      )}
    </div>
  )
}

function MatchingSection({
  requestId,
  requestStatus,
  requestType,
  cascadeTierIndex,
  requestLocation,
}: {
  requestId: string
  requestStatus: RequestStatus
  requestType: RequestType
  cascadeTierIndex: number | null
  requestLocation: { lat: number; lng: number } | null
}) {
  const findMatches = useFindMatches(requestId)
  const { data: matches, isLoading, isError } = useDonorMatches(requestId)
  const [findError, setFindError] = useState<string | null>(null)
  const canMatch = !CLOSED_STATUSES.includes(requestStatus)
  const isEmergency = requestType === 'EMERGENCY'

  const onFindMatches = async () => {
    setFindError(null)
    try {
      await findMatches.mutateAsync()
    } catch (err) {
      setFindError(err instanceof Error ? err.message : 'Could not run donor matching. Please try again.')
    }
  }

  const acceptedCount = matches?.filter((m) => m.match_status === 'ACCEPTED').length ?? 0

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Matched Donors</h2>
        {canMatch && !isEmergency && (
          <Button size="sm" onClick={onFindMatches} isLoading={findMatches.isPending}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Find Matching Donors
          </Button>
        )}
      </div>

      {canMatch && isEmergency && (
        <div className="mb-3">
          <EmergencySearchControl requestId={requestId} cascadeTierIndex={cascadeTierIndex} />
        </div>
      )}

      {findError && <ErrorMessage message={findError} />}

      {matches && matches.length > 0 && (
        <p className="mb-3 text-sm text-gray-600">
          {matches.length} donor{matches.length === 1 ? '' : 's'} contacted — {acceptedCount} accepted so far.
        </p>
      )}

      {isLoading && <Spinner label="Loading matches…" />}
      {isError && <ErrorMessage message="Could not load matches. Please refresh." />}
      {!isLoading && !isError && (!matches || matches.length === 0) && (
        <EmptyState
          icon={Users}
          title="No matched donors yet"
          description={
            isEmergency
              ? 'Activate the emergency search to find eligible candidates in expanding waves. Matches are software-suggested and don\'t imply medical certainty — contact details become available once accepted matches are confirmed further, which isn\'t built yet.'
              : 'Run donor matching to find eligible candidates. Matches are software-suggested and don\'t imply medical certainty — contact details become available once accepted matches are confirmed further, which isn\'t built yet.'
          }
        />
      )}
      {!isLoading && !isError && matches && matches.length > 0 && (
        <div className="flex flex-col gap-2">
          {matches.map((match) => (
            <DonorMatchCard key={match.id} match={match} />
          ))}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Map</h3>
          <RequestMap requestLocation={requestLocation} matches={matches ?? []} />
        </div>
      )}
    </div>
  )
}

function TimelineSection({ requestId, currentStatus }: { requestId: string; currentStatus: RequestStatus }) {
  const { data: history, isLoading, isError } = useRequestStatusHistory(requestId)

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Request Tracking</h2>
      <Card>
        {isLoading && <Spinner label="Loading timeline…" />}
        {isError && <ErrorMessage message="Could not load the status timeline. Please refresh." />}
        {!isLoading && !isError && <RequestTimeline history={history ?? []} currentStatus={currentStatus} />}
      </Card>
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

            <RequestActions requestId={request.id} requestStatus={request.status} />
          </Card>

          <TimelineSection requestId={request.id} currentStatus={request.status} />
          <MatchingSection
            requestId={request.id}
            requestStatus={request.status}
            requestType={request.request_type}
            cascadeTierIndex={request.cascade_tier_index}
            requestLocation={request.approx_lat != null && request.approx_lng != null ? { lat: request.approx_lat, lng: request.approx_lng } : null}
          />
        </>
      )}
    </div>
  )
}
