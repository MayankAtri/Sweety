ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'patient'
  CHECK (role IN ('patient', 'doctor'));
-- Composite foreign keys make assignment roles a database invariant, including
-- concurrent assignment and role changes. Assigned accounts cannot change role.
ALTER TABLE users ADD CONSTRAINT users_id_role_key UNIQUE (id, role);
CREATE TABLE doctor_patients (
  doctor_id bigint NOT NULL,
  patient_id bigint NOT NULL,
  doctor_role text NOT NULL DEFAULT 'doctor' CHECK (doctor_role = 'doctor'),
  patient_role text NOT NULL DEFAULT 'patient' CHECK (patient_role = 'patient'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, patient_id),
  FOREIGN KEY (doctor_id, doctor_role) REFERENCES users(id, role) ON DELETE CASCADE,
  FOREIGN KEY (patient_id, patient_role) REFERENCES users(id, role) ON DELETE CASCADE
);
CREATE INDEX doctor_patients_patient_idx ON doctor_patients(patient_id);
