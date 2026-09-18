// Live integration test against the DEPLOYED match-donors Edge Function
// (not a mock) — exercises the real HTTP path: auth, ownership
// authorization, blood-group/availability/eligibility filtering, and
// idempotency on re-run. Complements tests/matching-logic.test.ts, which
// covers the pure scoring/compatibility math in isolation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from './setup/testClient'

interface InvokeResult {
  data: { matchCount: number; inserted: number; updated: number; candidatesConsidered: number } | null
  status: number | null
  errorMessage: string | null
}

async function invokeMatchDonors(user: TestUser, requestId: string): Promise<InvokeResult> {
  const { data, error } = await user.client.functions.invoke('match-donors', { body: { requestId } })
  if (error) {
    const context = (error as { context?: Response }).context
    const status = context?.status ?? null
    let errorMessage = error.message
    try {
      const body = (await context?.clone().json()) as { error?: string } | undefined
      if (body?.error) errorMessage = body.error
    } catch {
      // response body wasn't JSON — fall back to error.message
    }
    return { data: null, status, errorMessage }
  }
  return { data, status: 200, errorMessage: null }
}

describe('match-donors edge function', () => {
  let requesterA: TestUser
  let requesterB: TestUser
  let compatibleAvailableDonor: TestUser // O-, AVAILABLE — should match an O+ request
  let incompatibleDonor: TestUser // A+, AVAILABLE — wrong blood group
  let unavailableCompatibleDonor: TestUser // O+, UNAVAILABLE — right group, not available
  let recentlyDonatedDonor: TestUser // O+, AVAILABLE, donated 10 days ago — ineligible

  let requestId: string

  beforeAll(async () => {
    ;[requesterA, requesterB, compatibleAvailableDonor, incompatibleDonor, unavailableCompatibleDonor, recentlyDonatedDonor] =
      await Promise.all([
        createTestUser('REQUESTER'),
        createTestUser('REQUESTER'),
        createTestUser('DONOR'),
        createTestUser('DONOR'),
        createTestUser('DONOR'),
        createTestUser('DONOR'),
      ])

    await Promise.all([
      requesterA.client.from('profiles').insert({ id: requesterA.id, full_name: 'Requester A', role: 'REQUESTER' }),
      requesterB.client.from('profiles').insert({ id: requesterB.id, full_name: 'Requester B', role: 'REQUESTER' }),
      compatibleAvailableDonor.client.from('profiles').insert({
        id: compatibleAvailableDonor.id,
        full_name: 'Compatible Available Donor',
        role: 'DONOR',
      }),
      incompatibleDonor.client
        .from('profiles')
        .insert({ id: incompatibleDonor.id, full_name: 'Incompatible Donor', role: 'DONOR' }),
      unavailableCompatibleDonor.client.from('profiles').insert({
        id: unavailableCompatibleDonor.id,
        full_name: 'Unavailable Compatible Donor',
        role: 'DONOR',
      }),
      recentlyDonatedDonor.client.from('profiles').insert({
        id: recentlyDonatedDonor.id,
        full_name: 'Recently Donated Donor',
        role: 'DONOR',
      }),
    ])

    await Promise.all([
      compatibleAvailableDonor.client
        .from('donor_profiles')
        .insert({ user_id: compatibleAvailableDonor.id, blood_group: 'O-', availability_status: 'AVAILABLE' }),
      incompatibleDonor.client
        .from('donor_profiles')
        .insert({ user_id: incompatibleDonor.id, blood_group: 'A+', availability_status: 'AVAILABLE' }),
      unavailableCompatibleDonor.client
        .from('donor_profiles')
        .insert({ user_id: unavailableCompatibleDonor.id, blood_group: 'O+', availability_status: 'UNAVAILABLE' }),
      recentlyDonatedDonor.client.from('donor_profiles').insert({
        user_id: recentlyDonatedDonor.id,
        blood_group: 'O+',
        availability_status: 'AVAILABLE',
        last_donation_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      }),
    ])

    const { data: request, error } = await requesterA.client
      .from('blood_requests')
      .insert({ requester_id: requesterA.id, blood_group: 'O+', units_required: 1, priority: 'URGENT' })
      .select()
      .single()
    if (error) throw error
    requestId = request!.id
  }, 30000)

  afterAll(async () => {
    await Promise.all(
      [requesterA, requesterB, compatibleAvailableDonor, incompatibleDonor, unavailableCompatibleDonor, recentlyDonatedDonor].map(
        (u) => deleteTestUser(u.id),
      ),
    )
  })

  it('rejects a non-owner (a different requester) from triggering matching on this request', async () => {
    const result = await invokeMatchDonors(requesterB, requestId)
    expect(result.status).toBe(403)
  })

  it('rejects a donor (not the requester) from triggering matching on this request', async () => {
    const result = await invokeMatchDonors(compatibleAvailableDonor, requestId)
    expect(result.status).toBe(403)
  })

  it('returns 404 for a nonexistent request', async () => {
    const result = await invokeMatchDonors(requesterA, '00000000-0000-0000-0000-000000000000')
    expect(result.status).toBe(404)
  })

  it('includes the compatible/available/eligible donor and excludes the incompatible/unavailable/ineligible ones', async () => {
    // Asserts donor-specific membership rather than an exact total match count:
    // this runs against the live, shared project, where other real donors
    // (e.g. the demo accounts) may legitimately also be O+/available/eligible
    // and correctly match too — that's not a bug, so the test must not assume
    // it has exclusive control of the database.
    const result = await invokeMatchDonors(requesterA, requestId)
    expect(result.status).toBe(200)
    expect(result.data?.matchCount).toBeGreaterThanOrEqual(1)

    const { data: matches, error } = await requesterA.client
      .from('donor_matches')
      .select('donor_id, match_score, distance_km')
      .eq('request_id', requestId)
    expect(error).toBeNull()
    const matchedDonorIds = new Set(matches?.map((m) => m.donor_id))

    expect(matchedDonorIds.has(compatibleAvailableDonor.id)).toBe(true)
    expect(matchedDonorIds.has(incompatibleDonor.id)).toBe(false)
    expect(matchedDonorIds.has(unavailableCompatibleDonor.id)).toBe(false)
    expect(matchedDonorIds.has(recentlyDonatedDonor.id)).toBe(false)

    const ourMatch = matches?.find((m) => m.donor_id === compatibleAvailableDonor.id)
    expect(ourMatch?.match_score).toBeGreaterThan(0)
  })

  it('transitions the request from CREATED to MATCHING and records it in status history', async () => {
    const { data: request } = await requesterA.client.from('blood_requests').select('status').eq('id', requestId).single()
    expect(request?.status).toBe('MATCHING')

    const { data: history } = await requesterA.client
      .from('request_status_history')
      .select('status')
      .eq('request_id', requestId)
      .eq('status', 'MATCHING')
    expect(history?.length).toBeGreaterThan(0)
  })

  it('is idempotent: re-running matching does not create a duplicate row for the same donor', async () => {
    const { data: before } = await requesterA.client
      .from('donor_matches')
      .select('id, donor_id')
      .eq('request_id', requestId)
    const ourRowBefore = before?.find((m) => m.donor_id === compatibleAvailableDonor.id)
    expect(ourRowBefore).toBeTruthy()

    const result = await invokeMatchDonors(requesterA, requestId)
    expect(result.status).toBe(200)
    expect(result.data?.inserted).toBe(0) // nothing new for anyone, everyone already had a row

    const { data: after } = await requesterA.client
      .from('donor_matches')
      .select('id, donor_id')
      .eq('request_id', requestId)
    const ourRowAfter = after?.find((m) => m.donor_id === compatibleAvailableDonor.id)

    expect(ourRowAfter?.id).toBe(ourRowBefore?.id) // same row, not a new one
    expect(after?.length).toBe(before?.length) // no growth in total rows for this request
  })
}, 60000)
