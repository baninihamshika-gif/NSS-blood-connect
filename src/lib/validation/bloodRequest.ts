import { z } from 'zod'

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const

const todayIso = () => new Date().toISOString().slice(0, 10)

export const createRequestSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS, { message: 'Select a blood group' }),
  unitsRequired: z
    .number({ message: 'Units required is required' })
    .int()
    .min(1, 'At least 1 unit is required')
    .max(50, 'Maximum 50 units'),
  hospitalName: z.string().max(200).optional().or(z.literal('')),
  facilityName: z.string().max(200).optional().or(z.literal('')),
  locationArea: z.string().max(200).optional().or(z.literal('')),
  requiredDate: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || value >= todayIso(), 'Required date cannot be in the past'),
  requiredTime: z.string().optional().or(z.literal('')),
  priority: z.enum(['NORMAL', 'URGENT', 'CRITICAL']),
})

export type CreateRequestFormValues = z.infer<typeof createRequestSchema>

export const createEmergencyRequestSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS, { message: 'Select a blood group' }),
  unitsRequired: z
    .number({ message: 'Units required is required' })
    .int()
    .min(1, 'At least 1 unit is required')
    .max(50, 'Maximum 50 units'),
  hospitalName: z.string().min(2, 'Hospital or facility name is required for an emergency request').max(200),
  locationArea: z.string().max(200).optional().or(z.literal('')),
  priority: z.enum(['URGENT', 'CRITICAL']),
})

export type CreateEmergencyRequestFormValues = z.infer<typeof createEmergencyRequestSchema>
