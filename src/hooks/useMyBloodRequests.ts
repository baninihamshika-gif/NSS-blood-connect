import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate'

export function useMyBloodRequests() {
  const { user } = useAuth()

  useRealtimeInvalidate({
    channelName: `my-blood-requests:${user?.id ?? 'anon'}`,
    table: 'blood_requests',
    filter: user ? `requester_id=eq.${user.id}` : undefined,
    queryKeys: [['my-blood-requests', user?.id]],
    enabled: Boolean(user),
  })

  return useQuery({
    queryKey: ['my-blood-requests', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blood_requests')
        .select('*')
        .eq('requester_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: Boolean(user),
  })
}
