-- ServicioPro only; never run against Plazado.
CREATE TABLE IF NOT EXISTS sp_provider_availability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_id uuid NOT NULL REFERENCES sp_provider_profiles(id),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 CHECK(ends_at>starts_at),
 UNIQUE(provider_id,starts_at,ends_at)
);
CREATE TABLE IF NOT EXISTS sp_provider_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_id uuid NOT NULL REFERENCES sp_provider_profiles(id),
 request_id uuid NOT NULL UNIQUE REFERENCES sp_service_requests(id),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','cancelled','completed')),
 CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS sp_provider_booking_window_idx ON sp_provider_bookings(provider_id,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS sp_provider_availability_window_idx ON sp_provider_availability(provider_id,starts_at,ends_at);
-- Future: PostGIS coverage zones, service-level qualifications, cancellation and re-dispatch.
