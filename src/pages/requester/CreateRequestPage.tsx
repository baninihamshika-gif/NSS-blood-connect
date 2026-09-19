import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useCreateBloodRequest } from '@/hooks/useCreateBloodRequest'
import { createRequestSchema, type CreateRequestFormValues } from '@/lib/validation/bloodRequest'
import { BLOOD_GROUPS } from '@/constants'
import { LocationPicker, type LatLng } from '@/components/map/LocationPicker'

export function CreateRequestPage() {
  const navigate = useNavigate()
  const createRequest = useCreateBloodRequest()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [location, setLocation] = useState<LatLng | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateRequestFormValues>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: { priority: 'NORMAL' },
  })

  const onSubmit = async (values: CreateRequestFormValues) => {
    setSubmitError(null)
    try {
      const request = await createRequest.mutateAsync({
        bloodGroup: values.bloodGroup,
        unitsRequired: values.unitsRequired,
        hospitalName: values.hospitalName,
        facilityName: values.facilityName,
        locationArea: values.locationArea,
        requiredDate: values.requiredDate,
        requiredTime: values.requiredTime,
        priority: values.priority,
        requestType: 'NORMAL',
        approxLat: location?.lat,
        approxLng: location?.lng,
      })
      navigate(`/requester/requests/${request.id}`, { replace: true })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to create request. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create Blood Request</h1>
        <p className="text-sm text-gray-600">Fill in the details to start finding matching donors.</p>
      </div>

      <Card>
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
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent</option>
            <option value="CRITICAL">Critical</option>
          </Select>

          <Input label="Hospital name (optional)" error={errors.hospitalName?.message} {...register('hospitalName')} />
          <Input
            label="Facility / department (optional)"
            error={errors.facilityName?.message}
            {...register('facilityName')}
          />
          <Input label="Location / area (optional)" error={errors.locationArea?.message} {...register('locationArea')} />
          <LocationPicker value={location} onChange={setLocation} label="Approximate location on map (optional)" />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Required date (optional)"
              type="date"
              error={errors.requiredDate?.message}
              {...register('requiredDate')}
            />
            <Input
              label="Required time (optional)"
              type="time"
              error={errors.requiredTime?.message}
              {...register('requiredTime')}
            />
          </div>

          <Button type="submit" isLoading={createRequest.isPending} className="mt-2 w-full">
            Create request
          </Button>
        </form>
      </Card>
    </div>
  )
}
