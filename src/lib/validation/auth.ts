import { z } from 'zod'

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Enter your full name').max(100),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
    role: z.enum(['DONOR', 'REQUESTER']),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
      .optional()
      .or(z.literal('')),
    city: z.string().max(100).optional().or(z.literal('')),
    area: z.string().max(100).optional().or(z.literal('')),
    bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.role !== 'DONOR' || Boolean(data.bloodGroup), {
    message: 'Blood group is required for donor registration',
    path: ['bloodGroup'],
  })

export type RegisterFormValues = z.infer<typeof registerSchema>

export const passwordResetSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
})

export type PasswordResetFormValues = z.infer<typeof passwordResetSchema>
