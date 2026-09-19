import { Check, CircleDashed, XCircle } from 'lucide-react'
import { statusLabel } from '@/lib/utilities/requestDisplay'
import type { RequestStatus, RequestStatusHistoryEntry } from '@/types/database'

const HAPPY_PATH: RequestStatus[] = ['CREATED', 'MATCHING', 'PARTIALLY_FULFILLED', 'FULFILLED', 'COMPLETED']

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function RequestTimeline({
  history,
  currentStatus,
}: {
  history: RequestStatusHistoryEntry[]
  currentStatus: RequestStatus
}) {
  const reachedStatuses = new Set(history.map((h) => h.status))
  const timeByStatus = new Map(history.map((h) => [h.status, h.timestamp]))
  const isTerminatedEarly = currentStatus === 'CANCELLED' || currentStatus === 'EXPIRED'

  // FULFILLED can be reached without ever passing through PARTIALLY_FULFILLED
  // (e.g. one donor covers the whole requirement) — skip showing that step
  // as "pending" once it's been bypassed, rather than implying it's still
  // expected.
  const steps = HAPPY_PATH.filter((status) => {
    if (status === 'PARTIALLY_FULFILLED' && !reachedStatuses.has('PARTIALLY_FULFILLED') && reachedStatuses.has('FULFILLED')) {
      return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-2">
      {steps.map((status) => {
        const reached = reachedStatuses.has(status) || (status === 'CREATED' && true)
        const timestamp = timeByStatus.get(status)
        const isCurrent = status === currentStatus
        return (
          <div key={status} className="flex items-center gap-2 text-sm">
            {reached ? (
              <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
            ) : (
              <CircleDashed className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
            )}
            <span className={reached ? 'font-medium text-gray-900' : 'text-gray-400'}>{statusLabel[status]}</span>
            {isCurrent && !isTerminatedEarly && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">Current</span>
            )}
            {timestamp && <span className="ml-auto text-xs text-gray-500">{formatTime(timestamp)}</span>}
          </div>
        )
      })}
      {isTerminatedEarly && (
        <div className="flex items-center gap-2 text-sm">
          <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
          <span className="font-medium text-gray-900">{statusLabel[currentStatus]}</span>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Current</span>
          {timeByStatus.get(currentStatus) && (
            <span className="ml-auto text-xs text-gray-500">{formatTime(timeByStatus.get(currentStatus)!)}</span>
          )}
        </div>
      )}
    </div>
  )
}
