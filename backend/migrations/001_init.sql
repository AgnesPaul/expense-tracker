CREATE TABLE IF NOT EXISTS categories (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id             SERIAL PRIMARY KEY,
  amount         NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  category_id    INTEGER NOT NULL REFERENCES categories(id),
  note           TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  spent_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipts (
  id           SERIAL PRIMARY KEY,
  expense_id   INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  s3_key       TEXT NOT NULL,
  content_type TEXT,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_spent_on_idx ON expenses (spent_on DESC);
CREATE INDEX IF NOT EXISTS expenses_category_idx ON expenses (category_id);
CREATE INDEX IF NOT EXISTS receipts_expense_idx  ON receipts (expense_id);

INSERT INTO categories (name) VALUES
  ('Food'), ('Transport'), ('Groceries'), ('Bills'),
  ('Shopping'), ('Health'), ('Entertainment'), ('Other')
ON CONFLICT (name) DO NOTHING;
