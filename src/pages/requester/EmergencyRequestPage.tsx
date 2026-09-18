import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useCreateBloodRequest } from '@/hooks/useCreateBloodRequest'
import { createEmergencyRequestSchema, type CreateEmergencyRequestFormValues } from '@/lib/validation/bloodRequest'
import { BLOOD_GROUPS } from '@/constants'

export function EmergencyRequestPage() {
  const navigate = useNavigate()
  const createRequest = useCreateBloodRequest()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateEmergencyRequestFormValues>({
    resolver: zodResolver(createEmergencyRequestSchema),
    defaultValues: { priority: 'CRITICAL' },
  })

  const onSubmit = async (values: CreateEmergencyRequestFormValues) => {
    setSubmitError(null)
    try {
      const request = await createRequest.mutateAsync({
        bloodGroup: values.bloodGroup,
        unitsRequired: values.unitsRequired,
        hospitalName: values.hospitalName,
        locationArea: values.locationArea,
        priority: values.priority,
        requestType: 'EMERGENCY',
      })
      navigate(`/requester/requests/${request.id}`, { replace: true })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to create request. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-3">
        <AlertTriangle className="h-8 w-8 text-red-600" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-red-900">Emergency Blood Request</h1>
          <p className="text-sm text-gray-600">Needed ASAP — this request is created immediately as CRITICAL/URGENT.</p>
        </div>
      </div>

      <Card className="border-red-200 bg-red-50">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {submitError && <ErrorMessage message={submitError} />}

          <div className="grid grid-cols-2 gap-3">
            <Select label="Blood group" error={errors.bloodGroup?.message} defaultValue="" {...register('bloodGroup')}>
              <option value="" disabled>
                Select blood group
              </option>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </Select>
            <Input
              label="Units required"
              type="number"
              min={1}
              max={50}
              error={errors.unitsRequired?.message}
              {...register('unitsRequired', { valueAsNumber: true })}
            />
          </div>

          <Select label="Priority" error={errors.priority?.message} {...register('priority')}>
            <option value="CRITICAL">Critical</option>
            <option value="URGENT">Urgent</option>
          </Select>

          <Input label="Hospital / facility name" error={errors.hospitalName?.message} {...register('hospitalName')} />
          <Input label="Location / area (optional)" error={errors.locationArea?.message} {...register('locationArea')} />

          <Button type="submit" variant="danger" isLoading={createRequest.isPending} className="mt-2 w-full">
            Activate Emergency Request
          </Button>
          <p className="text-center text-xs text-gray-500">
            Donor matching and outreach aren't live yet — this creates the request so it's ready to match as soon as
            that's available.
          </p>
        </form>
      </Card>
    </div>
  )
}
