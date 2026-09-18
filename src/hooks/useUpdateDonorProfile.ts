import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { AvailabilityStatus } from '@/types/database'

export interface UpdateDonorProfileInput {
  availabilityStatus: AvailabilityStatus
  dateOfBirth?: string
  lastDonationDate?: string
}

export function useUpdateDonorProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateDonorProfileInput) => {
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase
        .from('donor_profiles')
        .update({
          availability_status: input.availabilityStatus,
          date_of_birth: input.dateOfBirth || null,
          last_donation_date: input.lastDonationDate || null,
        })
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donor-profile', user?.id] }),
  })
}
