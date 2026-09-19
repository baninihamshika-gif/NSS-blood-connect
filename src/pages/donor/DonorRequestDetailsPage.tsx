import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Check, CheckCircle2, Droplet, MapPin, X } from 'lucide-react'
import { useIncomingMatchDetails } from '@/hooks/useIncomingMatchDetails'
import { useRespondToMatch } from '@/hooks/useRespondToMatch'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyState } from '@/components/ui/EmptyState'
import { priorityTone } from '@/lib/utilities/requestDisplay'

function AcceptedState({ hospitalName }: { hospitalName: string | null }) {
  return (
    <Card className="border-green-200 bg-green-50">
      <div className="flex items-center gap-2 text-green-800">
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        <p className="font-semibold">Request Accepted</p>
      </div>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <div>
          <dt className="inline font-medium text-gray-700">Hospital: </dt>
          <dd className="inline text-gray-900">{hospitalName ?? 'Not specified'}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-gray-700">Contact: </dt>
          <dd className="inline text-gray-900">Available after confirmation</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-gray-500">
        Coordination details (contact info, arrival tracking, directions) become available once this
        is confirmed further — that flow isn't built yet.
      </p>
    </Card>
  )
}

function DeclinedState() {
  return (
    <Card className="border-gray-200 bg-gray-50">
      <p className="text-sm text-gray-700">You declined this request.</p>
    </Card>
  )
}

function RespondActions({ matchId, requestId }: { matchId: string; requestId: string }) {
  const respond = useRespondToMatch()
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'ACCEPTED' | 'DECLINED' | null>(null)

  const onRespond = async (response: 'ACCEPTED' | 'DECLINED') => {
    setError(null)
    setPendingAction(response)
    try {
      await respond.mutateAsync({ matchId, requestId, response })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your response. Please try again.')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorMessage message={error} />}
      <div className="flex gap-3">
        <Button
          variant="primary"
          className="flex-1 bg-green-600 hover:bg-green-700"
          isLoading={pendingAction === 'ACCEPTED'}
          disabled={respond.isPending && pendingAction !== 'ACCEPTED'}
          onClick={() => onRespond('ACCEPTED')}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Accept
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          isLoading={pendingAction === 'DECLINED'}
          disabled={respond.isPending && pendingAction !== 'DECLINED'}
          onClick={() => onRespond('DECLINED')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Decline
        </Button>
      </div>
    </div>
  )
}

export function DonorRequestDetailsPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { data: match, isLoading, isError } = useIncomingMatchDetails(matchId)

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-4">
      <Link to="/donor/dashboard" className="inline-flex w-fit items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to dashboard
      </Link>

      {isLoading && <Spinner label="Loading request…" />}
      {isError && <ErrorMessage message="Could not load this request. Please refresh." />}
      {!isLoading && !isError && !match && (
        <EmptyState title="Match not found" description="This request match doesn't exist or isn't yours." />
      )}

      {!isLoading && !isError && match && (
        <>
          <Card className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100">
                  <Droplet className="h-6 w-6 text-brand-600" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">
                    {match.blood_requests.blood_group} · {match.blood_requests.units_required} unit
                    {match.blood_requests.units_required === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    {match.match_score != null ? `${match.match_score.toFixed(0)}% match relevance` : 'Match relevance unavailable'}
                  </p>
                </div>
              </div>
              <Badge tone={priorityTone[match.blood_requests.priority]}>{match.blood_requests.priority}</Badge>
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Hospital</dt>
                <dd className="text-sm font-medium text-gray-900">{match.blood_requests.hospital_name ?? 'Not specified'}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500">
                  <MapPin className="h-3 w-3" aria-hidden="true" /> Distance
                </dt>
                <dd className="text-sm font-medium text-gray-900">
                  {match.distance_km != null ? `${match.distance_km.toFixed(1)} km` : 'Not available'}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500">
                  <Calendar className="h-3 w-3" aria-hidden="true" /> Required by
                </dt>
                <dd className="text-sm font-medium text-gray-900">
                  {match.blood_requests.required_date ?? 'Not specified'}
                </dd>
              </div>
            </dl>
          </Card>

          {match.match_status === 'ACCEPTED' && <AcceptedState hospitalName={match.blood_requests.hospital_name} />}
          {match.match_status === 'DECLINED' && <DeclinedState />}
          {(match.match_status === 'NOTIFIED' || match.match_status === 'PENDING') && (
            <RespondActions matchId={match.id} requestId={match.request_id} />
          )}
        </>
      )}
    </div>
  )
}
