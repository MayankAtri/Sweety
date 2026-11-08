-- A PostgreSQL revision, rather than best-effort Redis deletion, keeps cache
-- invalidation atomic with every reading write (including seed/admin writes).
ALTER TABLE users ADD COLUMN readings_version bigint NOT NULL DEFAULT 0;
CREATE FUNCTION bump_readings_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    UPDATE users SET readings_version = readings_version + 1;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users SET readings_version = readings_version + 1 WHERE id = OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE users SET readings_version = readings_version + 1
      WHERE id IN (OLD.user_id, NEW.user_id);
  ELSE
    UPDATE users SET readings_version = readings_version + 1 WHERE id = NEW.user_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER readings_cache_revision AFTER INSERT OR UPDATE OR DELETE ON readings
  FOR EACH ROW EXECUTE FUNCTION bump_readings_version();
CREATE TRIGGER readings_cache_truncate AFTER TRUNCATE ON readings
  FOR EACH STATEMENT EXECUTE FUNCTION bump_readings_version();

CREATE TABLE reminder_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  missing_slots text[] NOT NULL CHECK (cardinality(missing_slots) BETWEEN 1 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_logs_user_date_key UNIQUE (user_id, date),
  CONSTRAINT reminder_logs_valid_slots CHECK (
    missing_slots <@ ARRAY['morning','after_breakfast','after_lunch','after_dinner']::text[]
  )
);
