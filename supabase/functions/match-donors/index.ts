// Matching engine — Phase 4. Runs entirely server-side with the service-role
// key; the client only ever sends a requestId. Match scores and donor
// eligibility are computed here from trusted database reads, never accepted
// from the caller, per the project's "do not trust client-supplied match
// scores or donor eligibility" rule.
//
// Scope: a single batch of top-scored candidates (MATCH_CANDIDATE_LIMIT).
// Wave-based expansion / timeout handling is the Emergency Cascade (Phase 7);
// donor notification and accept/decline is Phase 5. This function only
// discovers candidates, scores them, and writes donor_matches.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  calculateDistanceKm,
  calculateMatchScore,
  isBloodGroupCompatible,
  isWithinEligibilityWindow,
  MATCH_CANDIDATE_LIMIT,
  type AvailabilityStatus,
  type BloodGroup,
} from './matching-logic.ts'

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

    // Caller-scoped client: only used to reliably identify who is calling.
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

    // Service-role client: all privileged reads/writes below use this,
    // bypassing RLS deliberately — this function IS the trusted server-side
    // logic the RLS policies on donor_matches/request_status_history defer to.
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: request, error: requestError } = await admin
      .from('blood_requests')
      .select('id, requester_id, blood_group, units_required, status, priority, hospital_name, approx_lat, approx_lng')
      .eq('id', requestId)
      .maybeSingle()
    if (requestError) throw requestError
    if (!request) return json({ error: 'Request not found' }, 404)
    if (request.requester_id !== caller.id) {
      return json({ error: 'You do not own this request' }, 403)
    }
    if (CLOSED_STATUSES.has(request.status)) {
      return json({ error: `Request is ${request.status} and cannot be matched` }, 409)
    }

    const compatibleDonorGroups = ALL_BLOOD_GROUPS.filter((donorGroup) =>
      isBloodGroupCompatible(donorGroup, request.blood_group as BloodGroup),
    )

    const { data: candidates, error: candidatesError } = await admin
      .from('donor_profiles')
      .select('user_id, blood_group, availability_status, last_donation_date, approx_lat, approx_lng')
      .in('blood_group', compatibleDonorGroups)
      .in('availability_status', ['AVAILABLE', 'MAYBE'])
    if (candidatesError) throw candidatesError

    const now = new Date()
    const eligible = (candidates ?? []).filter((c) => isWithinEligibilityWindow(c.last_donation_date, now))

    // Batch-fetch response history for all eligible candidates in one query
    // rather than one query per donor. Empty for every donor until Phase 5
    // exists — handled as a neutral default by calculateMatchScore.
    const donorIds = eligible.map((c) => c.user_id)
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

    const scored = eligible.map((c) => {
      const distanceKm =
        request.approx_lat != null && request.approx_lng != null && c.approx_lat != null && c.approx_lng != null
          ? calculateDistanceKm(request.approx_lat, request.approx_lng, c.approx_lat, c.approx_lng)
          : null
      const history = responseHistory.get(c.user_id) ?? { accepted: 0, total: 0 }
      const score = calculateMatchScore({
        distanceKm,
        availabilityStatus: c.availability_status as AvailabilityStatus,
        lastDonationDate: c.last_donation_date,
        acceptedResponseCount: history.accepted,
        totalResponseCount: history.total,
        asOf: now,
      })
      return { donorId: c.user_id, score, distanceKm }
    })

    scored.sort((a, b) => b.score - a.score)
    const topCandidates = scored.slice(0, MATCH_CANDIDATE_LIMIT)

    // Preserve match_status on already-matched donors (e.g. once Phase 5
    // lets a donor accept/decline, re-running this must not reset that) —
    // insert new rows, update only score/distance on existing ones.
    const { data: existingMatches, error: existingError } = await admin
      .from('donor_matches')
      .select('id, donor_id')
      .eq('request_id', requestId)
    if (existingError) throw existingError
    const existingByDonor = new Map((existingMatches ?? []).map((m) => [m.donor_id, m.id]))

    let inserted = 0
    let updated = 0
    for (const candidate of topCandidates) {
      const existingId = existingByDonor.get(candidate.donorId)
      if (existingId) {
        const { error } = await admin
          .from('donor_matches')
          .update({ match_score: candidate.score, distance_km: candidate.distanceKm })
          .eq('id', existingId)
        if (error) throw error
        updated += 1
      } else {
        // New match: notification happens immediately as part of this same
        // pipeline (Phase 5 "notify donors"), not as a separately gated step
        // — so the row goes straight to NOTIFIED rather than sitting at the
        // PENDING default.
        const { error } = await admin.from('donor_matches').insert({
          request_id: requestId,
          donor_id: candidate.donorId,
          match_score: candidate.score,
          distance_km: candidate.distanceKm,
          match_status: 'NOTIFIED',
        })
        if (error) throw error
        inserted += 1

        const { error: notifyError } = await admin.from('notifications').insert({
          user_id: candidate.donorId,
          request_id: requestId,
          type: 'MATCH_REQUEST',
          title: `${request.blood_group} blood needed`,
          message: `You've been matched to a ${request.priority.toLowerCase()} request for ${request.units_required} unit(s) of ${request.blood_group}${request.hospital_name ? ` at ${request.hospital_name}` : ''}.`,
        })
        if (notifyError) throw notifyError
      }
    }

    // Real, honest status transition (CREATED -> MATCHING) with an audit
    // row — not the full state machine (Phase 6), just not lying about what
    // this run actually did.
    if (request.status === 'CREATED') {
      const { error: statusError } = await admin
        .from('blood_requests')
        .update({ status: 'MATCHING' })
        .eq('id', requestId)
      if (statusError) throw statusError
      const { error: historyError } = await admin.from('request_status_history').insert({
        request_id: requestId,
        status: 'MATCHING',
        changed_by: caller.id,
        notes: `Matching run found ${topCandidates.length} candidate(s).`,
      })
      if (historyError) throw historyError
    }

    return json({
      matchCount: topCandidates.length,
      inserted,
      updated,
      candidatesConsidered: eligible.length,
    })
  } catch (error) {
    console.error('match-donors error:', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
