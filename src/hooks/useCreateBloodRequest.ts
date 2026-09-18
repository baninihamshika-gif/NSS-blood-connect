import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { BloodGroup, RequestPriority, RequestType } from '@/types/database'

export interface CreateBloodRequestInput {
  bloodGroup: BloodGroup
  unitsRequired: number
  hospitalName?: string
  facilityName?: string
  locationArea?: string
  requiredDate?: string
  requiredTime?: string
  priority: RequestPriority
  requestType: RequestType
}

export function useCreateBloodRequest() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateBloodRequestInput) => {
      if (!user) throw new Error('Not signed in')
      const { data, error } = await supabase
        .from('blood_requests')
        .insert({
          requester_id: user.id,
          blood_group: input.bloodGroup,
          units_required: input.unitsRequired,
          hospital_name: input.hospitalName || null,
          facility_name: input.facilityName || null,
          location_area: input.locationArea || null,
          required_date: input.requiredDate || null,
          required_time: input.requiredTime || null,
          priority: input.priority,
          request_type: input.requestType,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-blood-requests', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['landing-stats'] })
    },
  })
}
