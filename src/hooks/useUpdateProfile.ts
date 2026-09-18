import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface UpdateProfileInput {
  fullName: string
  phone?: string
  city?: string
  area?: string
}

export function useUpdateProfile() {
  const { user, refreshProfile } = useAuth()

  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: input.fullName,
          phone: input.phone || null,
          city: input.city || null,
          area: input.area || null,
        })
        .eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => refreshProfile(),
  })
}
