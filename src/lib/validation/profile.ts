import { z } from 'zod'

const phoneField = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal(''))

const todayIso = () => new Date().toISOString().slice(0, 10)

export const basicProfileSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name').max(100),
  phone: phoneField,
  city: z.string().max(100).optional().or(z.literal('')),
  area: z.string().max(100).optional().or(z.literal('')),
})

export type BasicProfileFormValues = z.infer<typeof basicProfileSchema>

export const donorDetailsSchema = z.object({
  availabilityStatus: z.enum(['AVAILABLE', 'MAYBE', 'UNAVAILABLE']),
  dateOfBirth: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || value <= todayIso(), 'Date of birth cannot be in the future'),
  lastDonationDate: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || value <= todayIso(), 'Last donation date cannot be in the future'),
})

export type DonorDetailsFormValues = z.infer<typeof donorDetailsSchema>
