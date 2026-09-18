import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { AvailabilityStatus } from '@/types/database'

/** Lightweight mutation for the dashboard's quick availability toggle — updates
 * only availability_status, unlike useUpdateDonorProfile which writes the full form. */
export function useUpdateAvailability() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (availabilityStatus: AvailabilityStatus) => {
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase
        .from('donor_profiles')
        .update({ availability_status: availabilityStatus })
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donor-profile', user?.id] }),
  })
}
