import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/** Scoped to the current requester's own requests — this page is "my request
 * details," not a general request viewer (RLS itself allows any authenticated
 * user to read any request, since donors need to discover active ones). */
export function useBloodRequestDetails(requestId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['blood-request', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blood_requests')
        .select('*')
        .eq('id', requestId!)
        .eq('requester_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: Boolean(user) && Boolean(requestId),
  })
}
