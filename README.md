# TaskFlow Backend

A multi-tenant project management backend: users belong to organizations, create projects, manage tasks, assign work to teammates, and receive asynchronous email notifications when they're assigned something.

Built with **Node.js + TypeScript + Express**, **PostgreSQL** (via **Prisma**), **Redis + BullMQ**, and **Docker Compose**.

## 1. Project Overview

TaskFlow demonstrates a production-shaped backend for a Jira/Linear-style tool:

- Users register and automatically get their own organization (they become its `org_admin`); admins can invite other registered users into the org.
- Within an organization, admins/members create **projects** and **tasks**, assign tasks to teammates, comment on tasks, and view a per-project status dashboard.
- Assigning a task enqueues a **background email notification job** (mocked delivery) processed by a separate **Worker** process, with retries, exponential backoff and a dead-letter queue.
- Every data access path is scoped to the caller's organization at the service/repository layer - **the client can never read or write another tenant's data**, and cross-tenant access attempts return `403` without leaking resource details.

## 2. Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full write-up with diagrams. Short version:

```
Client → Express API (Route → Controller → Service → Repository) → PostgreSQL
                              │
                              └─→ BullMQ (Redis) → Worker → (mock) email provider
```

## 3. Technology Stack

| Concern | Choice |
|---|---|
| Language / framework | TypeScript, Node.js 20, Express |
| Database | PostgreSQL 16 |
| ORM / migrations | Prisma |
| Job queue | Redis 7 + BullMQ |
| Validation | Zod |
| Auth | JWT (access + refresh), bcrypt (cost factor 12) |
| API docs | OpenAPI 3 (`docs/openapi.json`) + Swagger UI |
| Testing | Jest, Supertest, ts-jest |
| Containers | Docker Compose (api, worker, postgres, redis) |
| Logging | pino (with redaction of secrets) |

## 4. Folder Structure

```
prisma/
  schema.prisma            # data model, enums, indexes (with rationale in comments)
  migrations/               # versioned SQL migrations (no hand-maintained schema.sql)
  seed.ts                   # seed script (2 orgs, 5 users, 3 projects, 12 tasks, assignments, comments)
src/
  config/                   # env, logger, prisma client, redis connection, swagger loader
  middleware/                # auth, validation, rate limiting, centralized error handling
  routes/                   # Express routers (thin - just wiring + validation schema)
  controllers/               # thin HTTP layer - parse req, call service, shape response
  services/                  # business rules, tenant scoping, RBAC checks
  repositories/               # all Prisma queries - the only layer that talks to the DB
  validators/                 # Zod schemas
  auth/                      # password hashing, JWT signing/verification, RBAC helper
  jobs/                      # BullMQ queue definitions, job processor, reconciliation sweep
  workers/                   # Worker process entrypoint
  utils/                     # ApiError, pagination helper, asyncHandler
  types/                     # shared TS types, Express request augmentation
  app.ts / server.ts         # Express app factory / HTTP server + graceful shutdown
tests/
  unit/                      # pure-logic tests (no DB/Redis)
  integration/                # supertest-driven HTTP tests (needs Postgres + Redis)
docs/openapi.json            # hand-maintained OpenAPI 3 spec, served by Swagger UI
postman/                     # Postman collection + environment
docker-compose.yml
Dockerfile                   # multi-stage: `api` and `worker` build targets
```

## 5. Database Design

Tables: `users`, `organizations`, `org_members`, `projects`, `tasks`, `task_assignments`, `comments`, plus `refresh_tokens` (required to support revocable refresh tokens).

**Enums:** `TaskStatus {todo, in_progress, review, done}`, `TaskPriority {low, medium, high, urgent}`, `Role {org_admin, member}`, `NotificationStatus {pending, queued, failed}` (tracks whether the assignment email job made it into Redis - see §9).

**Cascade / Restrict decisions:**

| Relation | On delete | Why |
|---|---|---|
| `org_members.org_id → organizations` | CASCADE | membership is meaningless without the org |
| `org_members.user_id → users` | CASCADE | membership is meaningless without the user |
| `projects.org_id → organizations` | CASCADE | a project cannot outlive its tenant |
| `projects.created_by_id → users` | SET NULL | keep project history if the creator is removed |
| `tasks.project_id → projects` | CASCADE | a task cannot outlive its project |
| `tasks.created_by_id → users` | SET NULL | keep task history if the creator is removed |
| `task_assignments.task_id → tasks` | CASCADE | assignment is meaningless without the task |
| `task_assignments.user_id → users` | CASCADE | can't stay "assigned" to a deleted user |
| `task_assignments.assigned_by_id → users` | SET NULL | preserve the assignment if the assigner is removed |
| `comments.task_id → tasks` | CASCADE | comment is meaningless without the task |
| `comments.author_id → users` | **RESTRICT** | preserve authorship/audit trail - deleting a user with comments must be an explicit, handled operation |
| `refresh_tokens.user_id → users` | CASCADE | sessions are meaningless without the user |

**Indexes** (each justified by its query pattern): `projects.org_id` (every query is tenant-scoped), `projects (org_id, deleted_at)` (soft-delete-aware listing), `tasks.project_id` / `(project_id, status)` (listing + dashboard), `tasks.priority`, `tasks.due_date` (filters), `task_assignments.user_id` / `.task_id` (assignee filter, "who's assigned"), `task_assignments.notification_status` (worker reconciliation sweep), `comments.task_id`, `refresh_tokens.user_id` / `.expires_at` (logout-all-devices, expiry cleanup), plus a **GIN index** on the generated `tasks.search_vector` column for full-text search.

**Bonus features implemented:**
- **Soft delete**: `projects.deleted_at` / `tasks.deleted_at`; all reads filter `deleted_at IS NULL`.
- **Full-text search**: a PostgreSQL `GENERATED ALWAYS AS (...) STORED` `tsvector` column (title weighted `A`, description `B`) with a GIN index, queried via `GET /tasks/search?q=`.

## 6. Authentication Flow

1. `POST /auth/register` - creates a `User` **and** a brand-new `Organization`, making the registrant its `org_admin` in one transaction. (Joining an *existing* org happens via `POST /organizations/members`, called by an admin.)
2. `POST /auth/login` - verifies the bcrypt hash, resolves the user's **active org context** (their most-recently-joined membership - see §8), and issues an **access token (15m)** + **refresh token (7d)**.
3. Refresh tokens are stored in the DB as a **SHA-256 hash** (never the raw token), with `expires_at` / `revoked_at` / `replaced_by_token_hash` for revocation and rotation.
4. `POST /auth/refresh` - verifies the JWT signature, checks the stored hash is not revoked/expired, **rotates** the token (issues a new one, revokes the old, chains them for auditability), and re-derives the org context in case membership/role changed. Reuse of an already-revoked refresh token revokes the entire session family (theft-detection heuristic).
5. `POST /auth/logout` - revokes one refresh token, or (bonus) all of the user's tokens with `{ "allDevices": true }`.
6. All 4 auth endpoints are rate-limited to **10 requests/minute/IP**.

## 7. Multi-Tenant Authorization Strategy

- The JWT access token embeds `{ userId, email, orgId, role }`, resolved **server-side at login/refresh time** - never from client input.
- `authenticate` middleware verifies the token and attaches `req.auth`; every controller passes `req.auth` into the service layer.
- **Every repository method that touches tenant data takes `orgId` as a required parameter** and folds it into the SQL `WHERE` clause (see `projectRepository`, `taskRepository`). A resource ID from another org simply cannot match the query - there is no way for a service to "forget" to scope a query, because the repository signature doesn't allow it.
- **Cross-tenant access → 403, not silent 404-everywhere**: to distinguish "doesn't exist" (404) from "exists in another org" (403) without ever leaking the other org's data, the service does an unscoped existence check *only* to decide which error to throw, and never returns that record's fields to the caller (`projectService.getOrThrow`, `taskService.getOrThrow`). This satisfies both requirements: correct `403` for cross-tenant attempts, and no data leakage.
- RBAC: `org_admin` can manage members and delete projects (`requireOrgAdmin` guard); both roles can otherwise read/write projects & tasks within their org.

## 8. Background Job Architecture

```
API: assignmentService.assign()
  1. Validate assignee is in the same org as the task
  2. INSERT task_assignment (Postgres transaction) → this is the durable, authoritative result
  3. AWAIT emailQueue.add(...) synchronously → the request does not respond until this settles
  4a. If enqueue succeeds: notification_status = 'queued' → API responds 201 Created
  4b. If enqueue fails:    notification_status = 'failed' → API responds 202 Accepted
      (the assignment is NOT rolled back either way)

Worker: BullMQ Worker on "email-notifications"
  - processes jobs with the mock email sender (jobs/email.job.ts)
  - on failure: retries with backoff 1s → 2s → 4s (3 attempts total)
  - after the 3rd failure: pushed onto the "email-notifications-dlq" dead-letter queue,
    and the original job is reported as "failed" via GET /jobs/:id
  - a reconciliation sweep runs every 60s (and once at startup), scanning
    task_assignments with notification_status IN (pending, failed) and re-enqueueing them
```

### Assignment + notification consistency strategy (spec requirement)

The spec requires: *"The assignment endpoint must persist the task assignment and enqueue the email notification job before returning a successful response."* This is enforced literally, not just as an ordering convention:

1. The `task_assignment` row is written first (Postgres transaction) - this is the durable, authoritative record of the assignment.
2. The API then **awaits** `emailQueue.add(...)` - the enqueue attempt happens synchronously, before any response is sent. The request never returns before both steps have been attempted.
3. **The response status depends on the actual outcome of step 2, not just on step 1 succeeding:**
   - Enqueue **succeeds** → `notification_status = 'queued'` → **`201 Created`**. Both persistence and enqueueing are confirmed done; this is the only case that gets `201`.
   - Enqueue **fails** (Redis blip, network partition) → `notification_status = 'failed'` → **`202 Accepted`**. The assignment itself is real and returned in the body, but the response is deliberately *not* `201` - it does not claim the notification job was enqueued, because it wasn't.
4. In the `202` case the assignment is **not rolled back**. Postgres and Redis cannot share a transaction, and rolling back a real, valid assignment just because a best-effort side effect failed would itself be an inconsistency (the client would have to retry the whole operation, risking confusing dedupe/conflict semantics on a task that may already be correctly assigned). Instead, the persisted row - now the recovery record - is picked up by the worker's **reconciliation sweep**, which retries enqueueing for any assignment stuck in `pending`/`failed`, capped at 5 sweep attempts per row.

In short: `201` is reserved exclusively for "both steps confirmed"; `202` honestly reports "assignment persisted, notification enqueue pending retry" instead of overclaiming success; and the persisted assignment is always the recovery anchor reconciliation works from - it is never left in limbo or silently discarded. See `src/services/assignment.service.ts` and `src/controllers/task.controller.ts` for the implementation, and [ARCHITECTURE.md](./ARCHITECTURE.md) for the full flow diagram.

**Bonus features implemented:**
- **Deduplication within 5 seconds**: a repeat assignment call for the same (task, user) pair within 5s of the first is treated as a no-op success (no duplicate DB row, no duplicate email job); outside that window it's a `409 TASK_ALREADY_ASSIGNED`.
- **Global email rate limit**: the BullMQ Worker is configured with `limiter: { max: 50, duration: 60_000 }` - never more than 50 emails/minute leave the worker.

## 9. Queue Retry / Dead-Letter Strategy

- `attempts: 3`, `backoff: { type: 'exponential', delay: 1000 }` → retries at **1s, 2s, 4s**.
- On the BullMQ `failed` event, if `job.attemptsMade >= job.opts.attempts`, the job payload is copied into the `email-notifications-dlq` queue for inspection/replay, and the original job remains queryable (and reports `status: "failed"`) via `GET /jobs/:id`.

## 10. API Endpoint Summary

Full request/response schemas: **Swagger UI at `/docs`** (`docs/openapi.json`).

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | creates user + new org (org_admin) |
| POST | `/auth/login` | |
| POST | `/auth/refresh` | rotates refresh token |
| POST | `/auth/logout` | `allDevices` bonus flag |
| GET/POST | `/organizations/members` | list / add member (admin) |
| PATCH/DELETE | `/organizations/members/:userId` | change role / remove (admin) |
| POST/GET | `/projects` | create / list (paginated) |
| GET/PATCH/DELETE | `/projects/:projectId` | delete = admin only |
| GET | `/projects/:projectId/dashboard` | task counts by status |
| POST/GET | `/projects/:projectId/tasks` | create / list with filters + pagination |
| PATCH | `/projects/:projectId/tasks/bulk-status` | bonus: bulk status update |
| GET/PATCH/DELETE | `/projects/:projectId/tasks/:taskId` | |
| POST | `/projects/:projectId/tasks/:taskId/assignments` | assign; `201` if the notification job was confirmed enqueued, `202` if persisted but enqueue failed (see §8) |
| DELETE | `/projects/:projectId/tasks/:taskId/assignments/:userId` | unassign |
| POST/GET | `/projects/:projectId/tasks/:taskId/comments` | |
| GET | `/tasks/search?q=` | bonus: full-text search |
| GET | `/jobs/:id` | background job status |
| GET | `/health` | liveness |

## 11. Local Setup

**Requirements:** Node.js 20+, Docker (recommended) or a local PostgreSQL 16 + Redis 7.

```bash
npm install
cp .env.example .env        # fill in real secrets for JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
npx prisma migrate deploy   # apply migrations
npx prisma db seed          # seed sample data
npm run dev:api             # http://localhost:3000
npm run dev:worker          # separate terminal - starts the email worker
```

## 12. Environment Variables

See [.env.example](./.env.example) for the full list with defaults/explanations. Required: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`. `DATABASE_URL_TEST` is used only by the integration test suite.

## 13. Docker Setup

```bash
docker compose up --build
```

This starts, in order (via healthchecks + `depends_on`): `postgres`, `redis`, a one-shot `migrate` job (runs `prisma migrate deploy` + `prisma db seed`), then `api` (port `3000`) and `worker`. The Postgres data directory is a named volume (`taskflow_postgres_data`) so data survives `docker compose down` (use `-v` to wipe it).

Override JWT secrets for a real deployment via `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` env vars before running compose.

## 14. Database Migrations

Managed entirely through Prisma migration files under `prisma/migrations/` (no hand-maintained `schema.sql`):

```bash
npx prisma migrate dev --name <description>   # create + apply a new migration locally
npx prisma migrate deploy                      # apply pending migrations (CI/production/Docker)
```

## 15. Seed Instructions

```bash
npx prisma db seed
```

Creates 2 organizations (Acme Corp, Globex Inc), 5 users (`alice/bob/carol@acme.test`, `dave/erin@globex.test`, password `Password123!` for all, hashed with bcrypt), 3 projects, 12 tasks spread across statuses/priorities, several assignments, and sample comments. The script is idempotent for users/orgs/memberships (`upsert`).

## 16. Running Tests

```bash
npm test                 # unit + integration
npm run test:unit         # pure logic - no DB/Redis required
npm run test:integration  # supertest against the real Express app - requires Postgres + Redis running
npm run test:coverage     # adds an HTML/lcov coverage report under coverage/
```

**Test isolation:** integration tests run against a **dedicated test database** (`DATABASE_URL_TEST`), migrated once in Jest's `globalSetup`, then `TRUNCATE ... RESTART IDENTITY CASCADE` before every test (`tests/integration/setup.ts`) - each test starts from a clean, known state. Unit tests touch neither Postgres nor Redis at all (dependencies are mocked with `jest.mock`), so `npm run test:unit` works with zero infrastructure running.

To run integration tests locally without full Docker: `docker compose up -d postgres redis`, then set `DATABASE_URL_TEST` in `.env` to a database on that Postgres instance (e.g. `.../taskflow_test`), then `npm run test:integration`.

Coverage highlights:
- **Unit**: bcrypt cost factor + verify/reject, JWT sign/verify + tamper rejection, pagination helper edge cases, task-assignment validation rules (cross-org rejection, dedupe window, 403-vs-404 shaping) via mocked repositories.
- **Integration**: full register/login/refresh(-rotation)/logout flow, task CRUD + filters + dashboard, cross-tenant 403 (project & task, with a check that the response body never contains the other org's data), client-supplied `orgId` being ignored, validation error shape, RBAC (member cannot delete a project), that assigning a task actually creates an inspectable BullMQ job, and the assignment consistency strategy itself: `201` when the notification job is confirmed enqueued, `202` (with the assignment still persisted) when enqueueing is simulated to fail, and that the reconciliation sweep subsequently enqueues it.

## 17. Swagger URL

`http://localhost:3000/docs` (raw spec at `http://localhost:3000/docs/openapi.json`).

## 18. Postman/Bruno Collection Usage

Import both files from `postman/`: `TaskFlow.postman_collection.json` and `TaskFlow.postman_environment.json`. Select the "TaskFlow Local" environment, then either run individual requests top-to-bottom or use Postman's **Run collection** to execute the whole thing in one go - it is safe to run sequentially end to end with zero manual edits.

The 10 folders are numbered in the exact order they're meant to run: `1. Auth → 2. Organization & Members → 3. Projects → 4. Task CRUD → 5. Task Filters & Search → 6. Assignment & Job Status → 7. Comments → 8. Unassignment → 9. Health → 10. Cleanup (Destructive)`. Destructive requests (`Delete task`, `Delete project`) live **only** in the final Cleanup folder, so nothing is torn down before a later request needs it.

Chained collection variables (all set automatically by test scripts, never hand-edited):
- **Auth → Register** stores `accessToken`, `refreshToken`, `orgId`, `userId`, `primaryEmail` (the dynamically-generated email, so **Login** right after it authenticates as the same user instead of a hardcoded one).
- **Organization & Members → Register second user** (a second, throwaway registration) stores `secondUserEmail`, which **Add member** uses to invite a real, guaranteed-to-exist user - no dependency on seed data - and **Add member**'s own response stores `memberUserId`, which **Update member role** and **Remove member** then target.
- **Projects → Create project** stores `projectId`; **Task CRUD → Create task** stores `taskId`.
- **Assignment & Job Status → Assign task** stores `assigneeUserId` and, from the actual assignment id in the response, `jobId` as `assignment-email-<assignmentId>` (the real BullMQ job id convention - no colon, nothing to copy/paste) - so **Get job status** resolves `GET {{baseUrl}}/jobs/{{jobId}}` automatically.

## 19. Important Technical Decisions

- **Offset pagination** (not cursor-based) - simpler to reason about for a task list with multiple simultaneous filters, and matches the exact response shape required by the spec.
- **Registration always creates a new org** (registrant becomes `org_admin`); joining an existing org is an explicit admin action (`POST /organizations/members`) rather than a public "join by org ID" endpoint, which would otherwise let anyone join any org.
- **Active org context = most-recently-joined membership.** A user can belong to multiple orgs; since there's no multi-org-switching endpoint in scope, we deterministically pick the newest membership as "active" at login/refresh (see `orgRepository.findMembershipsForUser`).
- **Refresh tokens are stored hashed** (SHA-256), never in plaintext, mirroring how passwords are never stored in plaintext.
- **Soft delete everywhere for projects/tasks** - all repository reads filter `deleted_at IS NULL`; nothing is hard-deleted via the API.
- See §8 for the assignment/notification **consistency strategy** decision in detail.

## 20. Security Considerations

- Passwords hashed with **bcrypt, cost factor 12**.
- JWTs signed with distinct access/refresh secrets; short-lived (15m) access tokens limit the blast radius of a leaked token.
- Refresh tokens are **revocable** (DB-backed) and **rotated** on every use; reuse of a revoked token revokes the entire session family.
- `helmet()` for standard security headers, strict CORS origin config, `express.json({ limit: '1mb' })` to bound request bodies.
- Centralized error handler **never leaks stack traces** in production responses (`NODE_ENV=production` strips the `details.message` field).
- Structured logging (`pino`) with `redact` rules covering `Authorization` headers, passwords, and tokens.
- Auth endpoints rate-limited to 10 req/min/IP; login/register responses are shaped identically for "wrong password" vs "unknown email" to avoid user enumeration.
- `.env` is git-ignored; only `.env.example` (no real secrets) is committed.

## 21. Known Limitations

- No multi-org "switch active organization" endpoint - a user always acts within their most-recently-joined org for a given token (see §19).
- Email delivery is **mocked** (structured as a real provider integration would be, but does not call a real provider) - per the assignment's explicit allowance.
- The full-text search bonus endpoint (`/tasks/search`) is separate from the `title`/`description` `ILIKE` fallback used by the task-list endpoint's `search`-style filtering; they are not merged into a single ranked index across both paths.
- Rate limiting and BullMQ rate limiting are in-process/single-Redis-instance; both are correct for the single-instance deployment this assignment targets but would need a shared limiter store for a multi-instance API deployment.

## 22. Bonus Features Implemented

- ★ Soft delete (`deleted_at` on `projects`/`tasks`)
- ★ PostgreSQL full-text search on task title + description (`GET /tasks/search`)
- ★ Refresh token rotation
- ★ Logout all devices (`allDevices: true`)
- ★ Bulk task status update (`PATCH /projects/:projectId/tasks/bulk-status`)
- ★ Deduplicate assignments within 5 seconds
- ★ Global email rate limit (50/minute) on the worker
- ★ Coverage report (`npm run test:coverage`)
- ★ Integration test asserting task assignment creates a real BullMQ job

## 23. Submission Links

- Architecture document: [ARCHITECTURE.md](./ARCHITECTURE.md)
- API documentation: Swagger UI at `/docs`, OpenAPI source at `docs/openapi.json`
- Postman collection: `postman/`
