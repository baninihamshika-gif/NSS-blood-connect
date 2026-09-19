import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Only CANCELLED/COMPLETED are ever sent from the client — every other
 * transition is system-driven (match-donors, or the auto-fulfillment
 * trigger) and the database rejects a client attempting them directly
 * (migration 0006/0007). */
export function useUpdateRequestStatus(requestId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (status: 'CANCELLED' | 'COMPLETED') => {
      const { error } = await supabase.from('blood_requests').update({ status }).eq('id', requestId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blood-request', requestId] })
      queryClient.invalidateQueries({ queryKey: ['request-status-history', requestId] })
      queryClient.invalidateQueries({ queryKey: ['donor-matches', requestId] })
      queryClient.invalidateQueries({ queryKey: ['my-blood-requests'] })
    },
  })
}
