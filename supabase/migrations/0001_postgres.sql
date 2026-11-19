CREATE TABLE members (
  student_id text PRIMARY KEY, name text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  password_hash text, invitation_hash text, created_at text NOT NULL
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, student_id text NOT NULL REFERENCES members ON DELETE CASCADE,
  expires_at bigint NOT NULL
);
CREATE INDEX sessions_member ON sessions(student_id);
CREATE TABLE login_attempts (key text PRIMARY KEY, count integer NOT NULL, reset_at bigint NOT NULL);
CREATE TABLE bands (
  id text PRIMARY KEY, name text NOT NULL, status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','dissolved'))
);
CREATE UNIQUE INDEX active_band_name ON bands(name) WHERE status='active';
CREATE TABLE band_members (
  band_id text NOT NULL REFERENCES bands ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES members, PRIMARY KEY(band_id,student_id)
);
CREATE TABLE room_days (date text PRIMARY KEY, is_open integer NOT NULL CHECK(is_open IN (0,1)), note text NOT NULL DEFAULT '');
CREATE TABLE room_slots (
  date text NOT NULL, slot_id text NOT NULL, is_open integer NOT NULL CHECK(is_open IN (0,1)),
  note text NOT NULL DEFAULT '', PRIMARY KEY(date,slot_id)
);
-- ISO date/timestamp strings preserve the existing API representation. Epoch milliseconds use bigint.
CREATE TABLE reservations (
  id text PRIMARY KEY, date text NOT NULL, slot_id text NOT NULL, reservation_type text NOT NULL,
  student_id text NOT NULL REFERENCES members, band_id text REFERENCES bands,
  created_at text NOT NULL, cancelled_at text,
  CHECK ((reservation_type='band' AND band_id IS NOT NULL) OR (reservation_type='personal' AND band_id IS NULL))
);
CREATE UNIQUE INDEX one_active_per_slot ON reservations(date,slot_id) WHERE cancelled_at IS NULL;
CREATE INDEX reservation_person_month ON reservations(student_id,date);
CREATE INDEX reservation_band_month ON reservations(band_id,date);
CREATE TABLE band_requests (
  id text PRIMARY KEY, request_type text NOT NULL CHECK(request_type IN ('create','update_members','dissolve')),
  band_name text NOT NULL, band_id text REFERENCES bands, student_id text NOT NULL REFERENCES members,
  reason text NOT NULL DEFAULT '', member_entries text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at text NOT NULL, reviewed_at text, reviewed_by text REFERENCES members,
  CHECK(jsonb_typeof(member_entries::jsonb)='array')
);
CREATE INDEX requests_status ON band_requests(status,created_at);
CREATE TABLE settings (
  id integer PRIMARY KEY CHECK(id=1), personal_open_days integer NOT NULL CHECK(personal_open_days BETWEEN 0 AND 13),
  monthly_band_limit integer NOT NULL CHECK(monthly_band_limit BETWEEN 0 AND 999),
  monthly_personal_limit integer NOT NULL CHECK(monthly_personal_limit BETWEEN 0 AND 999),
  weekly_open_slots text NOT NULL CHECK(jsonb_typeof(weekly_open_slots::jsonb)='object')
);

CREATE FUNCTION keion_reservation_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_catalog AS $$
DECLARE
  config settings%ROWTYPE;
  today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date;
  booking_date date := NEW.date::date;
  month_start text := to_char(booking_date,'YYYY-MM-01');
  month_end text := to_char(date_trunc('month',booking_date)+interval '1 month','YYYY-MM-DD');
  used integer;
BEGIN
  PERFORM pg_advisory_xact_lock(724019,1);
  SELECT * INTO config FROM settings WHERE id=1;
  IF NOT FOUND OR NEW.date<>to_char(booking_date,'YYYY-MM-DD') OR booking_date<today OR booking_date>today+13
    OR (NEW.reservation_type='personal' AND booking_date>today+config.personal_open_days) THEN
    RAISE EXCEPTION 'E_DATE_RANGE';
  END IF;
  IF NEW.slot_id NOT IN ('p1a','p1b','p2a','p2b','lunch','p3a','p3b','p4a','p4b','p5a','p5b','p6a','p6b')
    OR COALESCE((SELECT is_open FROM room_days WHERE date=NEW.date),1)=0
    OR COALESCE((SELECT is_open FROM room_slots WHERE date=NEW.date AND slot_id=NEW.slot_id),
      CASE WHEN (config.weekly_open_slots::jsonb -> (extract(dow FROM booking_date)::integer)::text) ? NEW.slot_id THEN 1 ELSE 0 END)=0 THEN
    RAISE EXCEPTION 'E_ROOM_CLOSED';
  END IF;
  IF NEW.reservation_type='band' AND NOT EXISTS (
    SELECT 1 FROM bands b JOIN band_members m ON m.band_id=b.id
    WHERE b.id=NEW.band_id AND b.status='active' AND m.student_id=NEW.student_id
  ) THEN RAISE EXCEPTION 'E_BAND_MEMBER'; END IF;
  IF EXISTS (SELECT 1 FROM reservations WHERE date=NEW.date AND slot_id=NEW.slot_id AND cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'E_SLOT_TAKEN';
  END IF;
  SELECT count(*) INTO used FROM reservations r WHERE r.cancelled_at IS NULL
    AND r.reservation_type=NEW.reservation_type AND r.date>=month_start AND r.date<month_end
    AND ((NEW.reservation_type='personal' AND r.student_id=NEW.student_id) OR (NEW.reservation_type='band' AND r.band_id=NEW.band_id));
  IF used >= (CASE WHEN NEW.reservation_type='band' THEN config.monthly_band_limit ELSE config.monthly_personal_limit END) THEN
    RAISE EXCEPTION 'E_MONTHLY_LIMIT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reservation_guard BEFORE INSERT ON reservations FOR EACH ROW EXECUTE FUNCTION keion_reservation_guard();

CREATE FUNCTION keion_approve_request() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_catalog AS $$
DECLARE entries jsonb := NEW.member_entries::jsonb;
BEGIN
  IF NEW.status<>'approved' OR OLD.status<>'pending' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(724019,1);
  IF NEW.request_type<>'create' AND NOT EXISTS(SELECT 1 FROM bands WHERE id=NEW.band_id AND status='active') THEN
    RAISE EXCEPTION 'E_REQUEST_INVALID';
  END IF;
  IF NEW.request_type<>'dissolve' THEN
    IF jsonb_typeof(entries)<>'array' OR jsonb_array_length(entries) NOT BETWEEN 1 AND 30 THEN
      RAISE EXCEPTION 'E_REQUEST_INVALID';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(entries) e LEFT JOIN members m ON m.student_id=e->>'student_id'
      WHERE jsonb_typeof(e)<>'object' OR m.student_id IS NULL OR m.name IS DISTINCT FROM e->>'name')
      OR (SELECT count(DISTINCT e->>'student_id') FROM jsonb_array_elements(entries) e)<>jsonb_array_length(entries) THEN
      RAISE EXCEPTION 'E_REQUEST_INVALID';
    END IF;
  END IF;
  IF NEW.request_type='create' THEN
    INSERT INTO bands(id,name,status) VALUES(NEW.id,NEW.band_name,'active');
  ELSIF NEW.request_type='update_members' THEN
    DELETE FROM band_members WHERE band_id=NEW.band_id;
  ELSIF NEW.request_type='dissolve' THEN
    UPDATE bands SET status='dissolved' WHERE id=NEW.band_id;
    UPDATE reservations SET cancelled_at=NEW.reviewed_at WHERE band_id=NEW.band_id AND cancelled_at IS NULL
      AND date>=to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo','YYYY-MM-DD');
  END IF;
  IF NEW.request_type IN ('create','update_members') THEN
    INSERT INTO band_members(band_id,student_id)
      SELECT CASE WHEN NEW.request_type='create' THEN NEW.id ELSE NEW.band_id END,e->>'student_id'
      FROM jsonb_array_elements(entries) e;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approve_band_request AFTER UPDATE OF status ON band_requests FOR EACH ROW EXECUTE FUNCTION keion_approve_request();

-- This app uses a trusted server connection, never the browser Data API.
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['members','sessions','login_attempts','bands','band_members','room_days','room_slots','reservations','band_requests','settings','_keion_migrations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC',table_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',table_name,role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION keion_reservation_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION keion_approve_request() FROM PUBLIC;
