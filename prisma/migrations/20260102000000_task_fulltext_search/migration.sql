-- STORED generated column: PostgreSQL keeps tsvector in sync automatically,
-- no application/trigger code needed. Title weighted above description.
ALTER TABLE "tasks"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

-- GIN index: avoids a sequential scan on full-text search queries.
CREATE INDEX "tasks_search_vector_idx" ON "tasks" USING GIN ("search_vector");
