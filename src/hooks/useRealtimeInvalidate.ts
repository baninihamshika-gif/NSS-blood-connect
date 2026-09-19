import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Subscribes to Postgres changes on one table (via Supabase Realtime) and
 * invalidates the given TanStack Query keys whenever a matching row
 * changes — the existing query hooks refetch normally, so this is the only
 * realtime-specific code most features need. Realtime respects the table's
 * RLS SELECT policy automatically: a client only receives events for rows
 * it could already read, so no separate authorization logic is needed here.
 */
export function useRealtimeInvalidate({
  channelName,
  table,
  filter,
  queryKeys,
  enabled = true,
}: {
  /** Must be unique per subscription (e.g. include the row id being watched). */
  channelName: string
  table: string
  /** Postgres changes filter, e.g. `request_id=eq.${requestId}`. Omit to watch the whole table. */
  filter?: string
  queryKeys: QueryKey[]
  enabled?: boolean
}) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => {
          for (const key of queryKeys) {
            queryClient.invalidateQueries({ queryKey: key })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // queryKeys/queryClient intentionally excluded: query keys are derived
    // from the same ids as channelName/filter, and queryClient is a stable
    // singleton — including them would only cause needless resubscribes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, filter, enabled])
}
