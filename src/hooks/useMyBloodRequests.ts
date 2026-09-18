import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function useMyBloodRequests() {
  const { user } = useAuth()

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
