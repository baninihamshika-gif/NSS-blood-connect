import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate'

export function useRequestStatusHistory(requestId: string | undefined) {
  useRealtimeInvalidate({
    channelName: `request-status-history:${requestId ?? 'none'}`,
    table: 'request_status_history',
    filter: requestId ? `request_id=eq.${requestId}` : undefined,
    queryKeys: [['request-status-history', requestId]],
    enabled: Boolean(requestId),
  })

  return useQuery({
    queryKey: ['request-status-history', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('request_status_history')
        .select('*')
        .eq('request_id', requestId!)
        .order('timestamp', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: Boolean(requestId),
  })
}
