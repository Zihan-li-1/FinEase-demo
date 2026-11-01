-- Synthetic suitability only. Scope includes fixed owner, dataset and demo deployment.
CREATE TABLE IF NOT EXISTS banking_demo_risk_assessments (
  scope TEXT PRIMARY KEY,
  record JSONB NOT NULL
);
