-- Bonus feature: PostgreSQL full-text search on task title + description.
--
-- We use a STORED generated column so PostgreSQL keeps the tsvector in sync
-- automatically on every INSERT/UPDATE (no application code or trigger
-- required). Title is weighted 'A' (most relevant) and description 'B'.
ALTER TABLE "tasks"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

-- GIN index: makes `search_vector @@ websearch_to_tsquery(...)` queries fast
-- instead of a sequential scan over every task in the organization.
CREATE INDEX "tasks_search_vector_idx" ON "tasks" USING GIN ("search_vector");
