// Hand-maintained mirror of the Supabase schema (see supabase/migrations).
// If the schema changes, update this file in the same commit.

export type UserRole = 'DONOR' | 'REQUESTER'

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-'

export type AvailabilityStatus = 'AVAILABLE' | 'MAYBE' | 'UNAVAILABLE'

export type RequestPriority = 'NORMAL' | 'URGENT' | 'CRITICAL'

export type RequestType = 'NORMAL' | 'EMERGENCY'

export type RequestStatus =
  | 'CREATED'
  | 'MATCHING'
  | 'CONTACTING_DONORS'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'

export type MatchStatus = 'PENDING' | 'NOTIFIED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'

export type ResponseStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED'

export type DonationStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export type Profile = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  role: UserRole
  city: string | null
  area: string | null
  created_at: string
  updated_at: string
}

export type DonorProfile = {
  id: string
  user_id: string
  blood_group: BloodGroup
  date_of_birth: string | null
  last_donation_date: string | null
  availability_status: AvailabilityStatus
  approx_lat: number | null
  approx_lng: number | null
  created_at: string
  updated_at: string
}

export type BloodRequest = {
  id: string
  requester_id: string
  blood_group: BloodGroup
  units_required: number
  hospital_name: string | null
  facility_name: string | null
  location_area: string | null
  required_date: string | null
  required_time: string | null
  priority: RequestPriority
  request_type: RequestType
  status: RequestStatus
  approx_lat: number | null
  approx_lng: number | null
  created_at: string
  updated_at: string
}

export type DonorMatch = {
  id: string
  request_id: string
  donor_id: string
  match_score: number | null
  distance_km: number | null
  match_status: MatchStatus
  created_at: string
  updated_at: string
}

export type DonorResponse = {
  id: string
  match_id: string
  request_id: string
  donor_id: string
  response: ResponseStatus
  responded_at: string | null
  created_at: string
}

export type DonationRecord = {
  id: string
  donor_id: string
  request_id: string | null
  donation_date: string
  units: number
  facility: string | null
  status: DonationStatus
  created_at: string
}

export type RequestStatusHistoryEntry = {
  id: string
  request_id: string
  status: RequestStatus
  changed_by: string | null
  timestamp: string
  notes: string | null
}

export type NotificationRecord = {
  id: string
  user_id: string
  request_id: string | null
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & Pick<Profile, 'id' | 'full_name' | 'role'>
        Update: Partial<Profile>
        Relationships: []
      }
      donor_profiles: {
        Row: DonorProfile
        Insert: Partial<DonorProfile> & Pick<DonorProfile, 'user_id' | 'blood_group'>
        Update: Partial<DonorProfile>
        Relationships: []
      }
      blood_requests: {
        Row: BloodRequest
        Insert: Partial<BloodRequest> &
          Pick<BloodRequest, 'requester_id' | 'blood_group' | 'units_required'>
        Update: Partial<BloodRequest>
        Relationships: []
      }
      donor_matches: {
        Row: DonorMatch
        Insert: Partial<DonorMatch> & Pick<DonorMatch, 'request_id' | 'donor_id'>
        Update: Partial<DonorMatch>
        Relationships: []
      }
      donor_responses: {
        Row: DonorResponse
        Insert: Partial<DonorResponse> &
          Pick<DonorResponse, 'match_id' | 'request_id' | 'donor_id'>
        Update: Partial<DonorResponse>
        Relationships: []
      }
      donation_records: {
        Row: DonationRecord
        Insert: Partial<DonationRecord> & Pick<DonationRecord, 'donor_id' | 'donation_date' | 'units'>
        Update: Partial<DonationRecord>
        Relationships: []
      }
      request_status_history: {
        Row: RequestStatusHistoryEntry
        Insert: Partial<RequestStatusHistoryEntry> &
          Pick<RequestStatusHistoryEntry, 'request_id' | 'status'>
        Update: Partial<RequestStatusHistoryEntry>
        Relationships: []
      }
      notifications: {
        Row: NotificationRecord
        Insert: Partial<NotificationRecord> &
          Pick<NotificationRecord, 'user_id' | 'type' | 'title' | 'message'>
        Update: Partial<NotificationRecord>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
