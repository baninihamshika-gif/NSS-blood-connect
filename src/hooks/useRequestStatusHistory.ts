import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useRequestStatusHistory(requestId: string | undefined) {
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
