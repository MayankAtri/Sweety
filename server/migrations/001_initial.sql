CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(trim(email))),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE readings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  slot text NOT NULL CHECK (slot IN ('morning', 'after_breakfast', 'after_lunch', 'after_dinner')),
  value integer NOT NULL CHECK (value BETWEEN 40 AND 600),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT readings_user_date_slot_key UNIQUE (user_id, date, slot)
);
-- The unique constraint also indexes user/date report and list queries.
