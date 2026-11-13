-- Solo para una base dedicada a ServicioPro. Requiere 001-003.
CREATE TABLE IF NOT EXISTS sp_service_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 service_id uuid NOT NULL REFERENCES sp_services(id),
 name text NOT NULL,
 description text,
 unit text NOT NULL DEFAULT 'unidad',
 unit_price_dop numeric(12,2),
 requires_quote boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 CHECK(unit_price_dop IS NULL OR unit_price_dop>=0),
 CHECK((requires_quote AND unit_price_dop IS NULL) OR (NOT requires_quote AND unit_price_dop IS NOT NULL)),
 UNIQUE(service_id,name),
 UNIQUE(id,service_id)
);
CREATE TABLE IF NOT EXISTS sp_request_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES sp_service_requests(id) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES sp_services(id),
 option_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 unit_price_dop numeric(12,2),
 line_total_dop numeric(12,2) GENERATED ALWAYS AS (quantity*unit_price_dop) STORED,
 FOREIGN KEY(option_id,service_id) REFERENCES sp_service_options(id,service_id)
);
ALTER TABLE sp_service_requests ADD COLUMN IF NOT EXISTS selected_provider_id uuid REFERENCES sp_provider_profiles(id);
ALTER TABLE sp_service_requests ADD COLUMN IF NOT EXISTS estimated_total_dop numeric(12,2);
ALTER TABLE sp_service_requests ADD COLUMN IF NOT EXISTS requires_manual_quote boolean NOT NULL DEFAULT false;
ALTER TABLE sp_service_requests ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
CREATE INDEX IF NOT EXISTS sp_request_items_request_idx ON sp_request_items(request_id);
CREATE INDEX IF NOT EXISTS sp_provider_services_service_idx ON sp_provider_services(service_id,provider_id);
-- Para reservas simultáneas se requieren bloqueos transaccionales y control de agenda.
