import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Droplet, MapPin } from 'lucide-react'
import { useBloodRequestDetails } from '@/hooks/useBloodRequestDetails'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyState } from '@/components/ui/EmptyState'
import { priorityTone, statusLabel, statusTone } from '@/lib/utilities/requestDisplay'

function formatUtcTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
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
            Donor matching, responses, and a full status timeline aren't live yet — this request is saved and ready
            for those once they ship.
          </div>
        </Card>
      )}
    </div>
  )
}
