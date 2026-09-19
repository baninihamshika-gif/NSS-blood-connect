import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/useNotifications'
import { Spinner } from '@/components/ui/Spinner'
import type { NotificationRecord } from '@/types/database'

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NotificationBell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: notifications, isLoading, isError } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0

  useEffect(() => {
    if (!open) return
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const onSelect = (notification: NotificationRecord) => {
    if (!notification.is_read) markRead.mutate(notification.id)
    setOpen(false)
    if (notification.request_id && profile?.role === 'REQUESTER') {
      navigate(`/requester/requests/${notification.request_id}`)
    } else if (notification.request_id && profile?.role === 'DONOR') {
      // The donor's specific match id isn't on the notification itself —
      // their dashboard's Incoming Requests list is the reliable place to
      // find it, so we send them there rather than guess a deep link.
      navigate('/donor/dashboard')
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
              >
                <Check className="h-3 w-3" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading && <Spinner label="Loading notifications…" />}
            {isError && <p className="px-4 py-6 text-center text-sm text-red-600">Could not load notifications.</p>}
            {!isLoading && !isError && (!notifications || notifications.length === 0) && (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No notifications yet.</p>
            )}
            {!isLoading &&
              !isError &&
              notifications?.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => onSelect(notification)}
                  className={`flex w-full flex-col gap-0.5 border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-gray-50 ${
                    notification.is_read ? '' : 'bg-brand-50/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!notification.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />}
                    <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                  </div>
                  <p className="text-xs text-gray-600">{notification.message}</p>
                  <p className="text-xs text-gray-400">{formatRelativeTime(notification.created_at)}</p>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
