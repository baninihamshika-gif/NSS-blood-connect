import type { RequestPriority, RequestStatus } from '@/types/database'

export const priorityTone: Record<RequestPriority, 'critical' | 'urgent' | 'normal'> = {
  CRITICAL: 'critical',
  URGENT: 'urgent',
  NORMAL: 'normal',
}

export const statusTone: Record<RequestStatus, 'critical' | 'urgent' | 'normal' | 'success' | 'neutral'> = {
  CREATED: 'neutral',
  MATCHING: 'urgent',
  CONTACTING_DONORS: 'urgent',
  PARTIALLY_FULFILLED: 'normal',
  FULFILLED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
}

export const statusLabel: Record<RequestStatus, string> = {
  CREATED: 'Created',
  MATCHING: 'Matching',
  CONTACTING_DONORS: 'Contacting Donors',
  PARTIALLY_FULFILLED: 'Partially Fulfilled',
  FULFILLED: 'Fulfilled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}
