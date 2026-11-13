-- ServicioPro marketplace; ejecutar solo en una base exclusiva de ServicioPro.
CREATE TABLE IF NOT EXISTS sp_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE, name text NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS sp_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category_id uuid NOT NULL REFERENCES sp_categories(id),
 name text NOT NULL,
 pricing_model text NOT NULL CHECK (pricing_model IN ('fixed','quote')),
 base_price_dop numeric(12,2),
 active boolean NOT NULL DEFAULT true,
 CHECK ((pricing_model='fixed' AND base_price_dop IS NOT NULL AND base_price_dop>=0)
 OR (pricing_model='quote' AND base_price_dop IS NULL)),
 UNIQUE(category_id,name)
);
CREATE TABLE IF NOT EXISTS sp_provider_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE REFERENCES sp_users(id),
 display_name text NOT NULL,
 verified boolean NOT NULL DEFAULT false,
 accepting_jobs boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sp_provider_services (
 provider_id uuid NOT NULL REFERENCES sp_provider_profiles(id),
 service_id uuid NOT NULL REFERENCES sp_services(id),
 PRIMARY KEY(provider_id,service_id)
);
CREATE TABLE IF NOT EXISTS sp_service_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_user_id uuid NOT NULL REFERENCES sp_users(id),
 service_id uuid NOT NULL REFERENCES sp_services(id),
 address_text text NOT NULL,
 description text NOT NULL,
 status text NOT NULL DEFAULT 'requested'
 CHECK(status IN ('requested','quoted','accepted','in_progress','completed','cancelled','disputed')),
 fixed_price_dop numeric(12,2),
 accepted_quote_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(fixed_price_dop IS NULL OR fixed_price_dop>=0)
);
CREATE TABLE IF NOT EXISTS sp_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES sp_service_requests(id),
 provider_id uuid NOT NULL REFERENCES sp_provider_profiles(id),
 amount_dop numeric(12,2) NOT NULL CHECK(amount_dop>=0),
 notes text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,request_id)
);
ALTER TABLE sp_service_requests ADD CONSTRAINT sp_request_accepted_quote_fk
 FOREIGN KEY (accepted_quote_id,id) REFERENCES sp_quotes(id,request_id);
CREATE TABLE IF NOT EXISTS sp_assignments (
 request_id uuid PRIMARY KEY REFERENCES sp_service_requests(id),
 provider_id uuid NOT NULL REFERENCES sp_provider_profiles(id),
 accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sp_request_events (
 id bigserial PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES sp_service_requests(id),
 actor_user_id uuid REFERENCES sp_users(id),
 from_status text,
 to_status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sp_request_customer_idx ON sp_service_requests(customer_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sp_request_service_status_idx ON sp_service_requests(service_id,status);
INSERT INTO sp_categories(slug,name) VALUES
 ('electricidad','Electricidad'),('plomeria','Plomería'),('limpieza','Limpieza de hogares'),
 ('organizacion','Organización de clósets'),('pintura','Pintura'),
 ('climatizacion','Aires acondicionados'),('carpinteria','Carpintería'),
 ('muebles','Montaje de muebles') ON CONFLICT(slug) DO NOTHING;
-- No se fijan precios comerciales sin aprobación. Los servicios se cargan posteriormente.
