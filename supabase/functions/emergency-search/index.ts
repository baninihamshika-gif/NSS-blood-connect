// Emergency cascade — Phase 7. Builds on match-donors (Phase 4/5): assumes
// candidate discovery/scoring/notification already works the same way, and
// adds what match-donors deliberately doesn't do — timeout handling, radius
// expansion, and additional waves, stopping as soon as the request is
// fulfilled or every radius tier is exhausted. Runs entirely server-side
// with the service-role key, same trust model as match-donors: the client
// only ever sends a requestId.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  calculateDistanceKm,
  calculateMatchScore,
  EMERGENCY_CASCADE_RADII_KM,
  isBloodGroupCompatible,
  isNotifiedMatchTimedOut,
  isWithinEligibilityWindow,
  isWithinRadius,
  MATCH_CANDIDATE_LIMIT,
  type AvailabilityStatus,
  type BloodGroup,
} from '../_shared/matching-logic.ts'

const ALL_BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
const CLOSED_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'EXPIRED', 'FULFILLED'])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: caller },
      error: authError,
    } = await callerClient.auth.getUser()
    if (authError || !caller) return json({ error: 'Invalid or expired session' }, 401)

    let body: { requestId?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }
    const requestId = body.requestId
    if (!requestId || typeof requestId !== 'string') {
      return json({ error: 'requestId is required' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: request, error: requestError } = await admin
      .from('blood_requests')
      .select('id, requester_id, blood_group, units_required, status, priority, hospital_name, approx_lat, approx_lng, cascade_tier_index')
      .eq('id', requestId)
      .maybeSingle()
    if (requestError) throw requestError
    if (!request) return json({ error: 'Request not found' }, 404)
    if (request.requester_id !== caller.id) {
      return json({ error: 'You do not own this request' }, 403)
    }

    // --- Timeout handling: expire stale NOTIFIED matches before evaluating
    // whether a new wave is needed, so donors who never responded don't
    // silently block progress forever.
    const now = new Date()
    const { data: notifiedMatches, error: notifiedError } = await admin
      .from('donor_matches')
      .select('id, created_at')
      .eq('request_id', requestId)
      .eq('match_status', 'NOTIFIED')
    if (notifiedError) throw notifiedError

    const timedOutIds = (notifiedMatches ?? [])
      .filter((m) => isNotifiedMatchTimedOut(m.created_at, now))
      .map((m) => m.id)
    if (timedOutIds.length > 0) {
      const { error: expireError } = await admin
        .from('donor_matches')
        .update({ match_status: 'EXPIRED' })
        .in('id', timedOutIds)
      if (expireError) throw expireError
    }

    // --- Stop conditions.
    const { count: acceptedCount, error: acceptedError } = await admin
      .from('donor_matches')
      .select('id', { count: 'exact', head: true })
      .eq('request_id', requestId)
      .eq('match_status', 'ACCEPTED')
    if (acceptedError) throw acceptedError

    if ((acceptedCount ?? 0) >= request.units_required) {
      return json({ done: true, reason: 'fulfilled', wave: request.cascade_tier_index, timedOutExpired: timedOutIds.length })
    }
    if (CLOSED_STATUSES.has(request.status)) {
      return json({ done: true, reason: 'closed', wave: request.cascade_tier_index, timedOutExpired: timedOutIds.length })
    }

    // Same real, honest status transition match-donors makes — the cascade
    // is itself a form of "matching has started," regardless of whether
    // this particular wave finds anyone.
    if (request.status === 'CREATED') {
      const { error: statusError } = await admin.from('blood_requests').update({ status: 'MATCHING' }).eq('id', requestId)
      if (statusError) throw statusError
    }

    // --- Find every eligible candidate not already tried on this request
    // (any status — NOTIFIED, ACCEPTED, DECLINED, EXPIRED all count as
    // "already tried"), then walk radius tiers in memory rather than
    // re-querying the database per tier.
    const { data: existingMatches, error: existingError } = await admin
      .from('donor_matches')
      .select('donor_id')
      .eq('request_id', requestId)
    if (existingError) throw existingError
    const existingDonorIds = new Set((existingMatches ?? []).map((m) => m.donor_id))

    const compatibleDonorGroups = ALL_BLOOD_GROUPS.filter((donorGroup) =>
      isBloodGroupCompatible(donorGroup, request.blood_group as BloodGroup),
    )
    const { data: candidates, error: candidatesError } = await admin
      .from('donor_profiles')
      .select('user_id, blood_group, availability_status, last_donation_date, approx_lat, approx_lng')
      .in('blood_group', compatibleDonorGroups)
      .in('availability_status', ['AVAILABLE', 'MAYBE'])
    if (candidatesError) throw candidatesError

    const eligible = (candidates ?? [])
      .filter((c) => !existingDonorIds.has(c.user_id))
      .filter((c) => isWithinEligibilityWindow(c.last_donation_date, now))
      .map((c) => ({
        ...c,
        distanceKm:
          request.approx_lat != null && request.approx_lng != null && c.approx_lat != null && c.approx_lng != null
            ? calculateDistanceKm(request.approx_lat, request.approx_lng, c.approx_lat, c.approx_lng)
            : null,
      }))

    // Walk tiers starting after whatever's already been examined, stopping
    // at the first tier with at least one untried candidate.
    let tierIndex: number | null = request.cascade_tier_index === null ? 0 : request.cascade_tier_index + 1
    let tierCandidates: typeof eligible = []
    while (tierIndex !== null && tierIndex < EMERGENCY_CASCADE_RADII_KM.length) {
      const radiusKm = EMERGENCY_CASCADE_RADII_KM[tierIndex]
      tierCandidates = eligible.filter((c) => isWithinRadius(c.distanceKm, radiusKm))
      if (tierCandidates.length > 0) break
      tierIndex += 1
    }

    if (tierIndex === null || tierIndex >= EMERGENCY_CASCADE_RADII_KM.length || tierCandidates.length === 0) {
      const { error: exhaustedError } = await admin
        .from('blood_requests')
        .update({ cascade_tier_index: EMERGENCY_CASCADE_RADII_KM.length - 1 })
        .eq('id', requestId)
      if (exhaustedError) throw exhaustedError
      return json({
        done: true,
        reason: 'exhausted',
        wave: EMERGENCY_CASCADE_RADII_KM.length - 1,
        timedOutExpired: timedOutIds.length,
      })
    }

    // --- Fetch response history for scoring (same as match-donors).
    const donorIds = tierCandidates.map((c) => c.user_id)
    const responseHistory = new Map<string, { accepted: number; total: number }>()
    if (donorIds.length > 0) {
      const { data: responses, error: responsesError } = await admin
        .from('donor_responses')
        .select('donor_id, response')
        .in('donor_id', donorIds)
        .in('response', ['ACCEPTED', 'DECLINED'])
      if (responsesError) throw responsesError
      for (const r of responses ?? []) {
        const entry = responseHistory.get(r.donor_id) ?? { accepted: 0, total: 0 }
        entry.total += 1
        if (r.response === 'ACCEPTED') entry.accepted += 1
        responseHistory.set(r.donor_id, entry)
      }
    }

    const scored = tierCandidates.map((c) => {
      const history = responseHistory.get(c.user_id) ?? { accepted: 0, total: 0 }
      const score = calculateMatchScore({
        distanceKm: c.distanceKm,
        availabilityStatus: c.availability_status as AvailabilityStatus,
        lastDonationDate: c.last_donation_date,
        acceptedResponseCount: history.accepted,
        totalResponseCount: history.total,
        asOf: now,
      })
      return { donorId: c.user_id, score, distanceKm: c.distanceKm }
    })
    scored.sort((a, b) => b.score - a.score)
    const toNotify = scored.slice(0, MATCH_CANDIDATE_LIMIT)

    for (const candidate of toNotify) {
      const { error: insertError } = await admin.from('donor_matches').insert({
        request_id: requestId,
        donor_id: candidate.donorId,
        match_score: candidate.score,
        distance_km: candidate.distanceKm,
        match_status: 'NOTIFIED',
      })
      if (insertError) throw insertError

      const { error: notifyError } = await admin.from('notifications').insert({
        user_id: candidate.donorId,
        request_id: requestId,
        type: 'MATCH_REQUEST',
        title: `${request.blood_group} blood urgently needed`,
        message: `Emergency cascade wave ${tierIndex + 1}: you've been matched to a ${request.priority.toLowerCase()} request for ${request.units_required} unit(s) of ${request.blood_group}${request.hospital_name ? ` at ${request.hospital_name}` : ''}.`,
      })
      if (notifyError) throw notifyError
    }

    const { error: updateTierError } = await admin
      .from('blood_requests')
      .update({ cascade_tier_index: tierIndex })
      .eq('id', requestId)
    if (updateTierError) throw updateTierError

    return json({
      done: false,
      wave: tierIndex,
      radiusKm: EMERGENCY_CASCADE_RADII_KM[tierIndex],
      newMatches: toNotify.length,
      timedOutExpired: timedOutIds.length,
    })
  } catch (error) {
    console.error('emergency-search error:', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
