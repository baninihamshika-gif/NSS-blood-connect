import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useAuth } from '@/hooks/useAuth'
import { passwordResetSchema, type PasswordResetFormValues } from '@/lib/validation/auth'

export function ForgotPasswordPage() {
  const { requestPasswordReset, actionLoading } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordResetFormValues>({ resolver: zodResolver(passwordResetSchema) })

  const onSubmit = async (values: PasswordResetFormValues) => {
    setSubmitError(null)
    try {
      await requestPasswordReset(values.email)
      setSent(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to send reset email.')
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <h1 className="text-xl font-bold text-gray-900">Reset your password</h1>
        <p className="mt-1 text-sm text-gray-600">We'll email you a link to reset it.</p>

        {sent ? (
          <p className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            {submitError && <ErrorMessage message={submitError} />}
            <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
            <Button type="submit" isLoading={actionLoading} className="mt-2 w-full">
              Send reset link
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-gray-600">
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Back to login
          </Link>
        </p>
      </Card>
    </div>
  )
}
