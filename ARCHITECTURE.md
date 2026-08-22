# TaskFlow - Architecture

## 1. System Components

```mermaid
flowchart LR
    Client(["Client / Postman / Swagger UI"])

    subgraph API["API service (Express)"]
        Routes["Routes"] --> Controllers["Controllers"] --> Services["Services\n(RBAC + tenant scoping)"] --> Repos["Repositories\n(Prisma queries)"]
    end

    subgraph Worker["Worker service"]
        BullWorker["BullMQ Worker"] --> EmailJob["Email job processor\n(mock provider)"]
        Sweep["Reconciliation sweep\n(every 60s)"]
    end

    PG[(PostgreSQL)]
    Redis[(Redis)]

    Client -- HTTPS/JSON --> Routes
    Repos -- SQL --> PG
    Services -- "enqueue email job" --> Redis
    BullWorker -- "consume jobs" --> Redis
    Sweep -- "find stuck assignments" --> PG
    Sweep -- "re-enqueue" --> Redis
    EmailJob -. "on exhausted retries" .-> DLQ[("email-notifications-dlq")]
    DLQ --> Redis
```

- **API service**: stateless Express app (`src/app.ts`). Route → Controller → Service → Repository. Owns request validation (Zod), authentication/authorization, and all business rules. Talks to Postgres via Prisma and to Redis only to *enqueue* jobs / read job status (`GET /jobs/:id`).
- **Worker service**: separate Node.js process (`src/workers/index.ts`) running a BullMQ `Worker` that consumes the `email-notifications` queue, plus a periodic reconciliation sweep. Shares the same Prisma schema/client and codebase as the API, but is deployed and scaled independently.
- **PostgreSQL**: the single system of record for all tenant data (users, orgs, projects, tasks, assignments, comments, refresh tokens).
- **Redis**: backs BullMQ (job queue, retries, backoff, dead-letter queue) and nothing else - it holds no tenant data, only job state.

## 2. Request Flow (typical read/write)

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as authenticate middleware
    participant V as validate middleware (Zod)
    participant Ctrl as Controller
    participant Svc as Service
    participant Repo as Repository
    participant DB as PostgreSQL

    C->>MW: Request + Bearer access token
    MW->>MW: verify JWT signature/expiry
    MW->>Ctrl: req.auth = {userId, orgId, role}
    C->>V: (params/query/body)
    V->>Ctrl: parsed & coerced input
    Ctrl->>Svc: call with req.auth + input
    Svc->>Svc: RBAC check (if required)
    Svc->>Repo: query, always passing auth.orgId
    Repo->>DB: SQL WHERE ... org_id = $1 ...
    DB-->>Repo: rows
    Repo-->>Svc: rows
    Svc-->>Ctrl: result / throws ApiError
    Ctrl-->>C: JSON response (or {error, code, details})
```

`req.auth.orgId` and `req.auth.role` are read **only** from the verified JWT payload - never from the request body/query/params - which is what makes "do not trust client-provided org_id" structurally true rather than just a convention.

## 3. Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant API as Auth Service
    participant DB as PostgreSQL

    C->>API: POST /auth/register {email, password, name, organizationName}
    API->>API: bcrypt.hash(password, cost=12)
    API->>DB: TX: create User, create Organization, create OrgMember(role=org_admin)
    API->>API: sign access token (15m) + refresh token (7d)
    API->>DB: store SHA-256(refreshToken) in refresh_tokens
    API-->>C: {user, accessToken, refreshToken}

    C->>API: POST /auth/refresh {refreshToken}
    API->>API: verify JWT signature/expiry
    API->>DB: lookup refresh_tokens by SHA-256(refreshToken)
    alt token revoked already
        API->>DB: revoke ALL tokens for user (reuse = theft signal)
        API-->>C: 401 REFRESH_TOKEN_REUSED
    else valid
        API->>DB: revoke old token, insert new one (rotation)
        API-->>C: {user, new accessToken, new refreshToken}
    end
```

## 4. Task Assignment + Email Notification Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant Svc as AssignmentService
    participant DB as PostgreSQL
    participant Q as BullMQ (Redis)
    participant W as Worker

    C->>Svc: POST .../tasks/:id/assignments {userId}
    Svc->>Svc: validate assignee is in same org
    Svc->>DB: check existing assignment (dedupe / conflict)
    Svc->>DB: TX: INSERT task_assignment (notification_status=pending)
    DB-->>Svc: committed - this IS the success response
    Svc-->>C: 201 Created (assignment row)
    Svc->>Q: emailQueue.add(...) [best effort, after responding is prepared]
    alt enqueue succeeds
        Svc->>DB: notification_status = queued
    else enqueue fails
        Svc->>DB: notification_status = failed (logged, NOT rolled back)
    end

    W->>Q: pick up job
    W->>W: mock send email
    alt success
        W->>Q: mark completed
    else failure (up to 3 attempts, 1s/2s/4s backoff)
        W->>Q: retry
        Note over W,Q: after 3rd failure -> push to email-notifications-dlq,\nGET /jobs/:id reports "failed"
    end

    loop every 60s
        W->>DB: find assignments with notification_status IN (pending, failed)
        W->>Q: re-enqueue each
    end
```

The assignment write and the queue enqueue are **not** wrapped in one atomic operation (Postgres and Redis cannot share a transaction). See the "Consistency strategy" section below for why that's the correct trade-off here, and `src/services/assignment.service.ts` for the implementation.

## 5. Multi-Tenant Isolation

- **Enforcement point**: the repository layer. `projectRepository` / `taskRepository` methods that read or write tenant data require `orgId` as a parameter and always include it in the Prisma `where` clause. There is no code path in the service layer that can query tasks/projects without supplying the caller's org.
- **403 vs 404 without leaking data**: `projectService.getOrThrow` / `taskService.getOrThrow` first do an org-scoped lookup; if that misses, they do a second, *unscoped* existence check purely to decide which error to throw (`404` if it truly doesn't exist anywhere, `403` if it exists in a different org) - the unscoped lookup's result is **never** serialized into the response.
- **RBAC**: `org_admin` vs `member`, checked in the service layer (`requireOrgAdmin`) before any mutation that's admin-only (delete project, manage members).

## 6. Database Relationships

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ ORG_MEMBERS : has
    USERS ||--o{ ORG_MEMBERS : "belongs to orgs via"
    ORGANIZATIONS ||--o{ PROJECTS : owns
    PROJECTS ||--o{ TASKS : contains
    TASKS ||--o{ TASK_ASSIGNMENTS : has
    USERS ||--o{ TASK_ASSIGNMENTS : "assigned via"
    TASKS ||--o{ COMMENTS : has
    USERS ||--o{ COMMENTS : authors
    USERS ||--o{ REFRESH_TOKENS : owns

    ORGANIZATIONS {
        uuid id PK
        string name
        string slug UK
    }
    USERS {
        uuid id PK
        string email UK
        string password_hash
        string name
    }
    ORG_MEMBERS {
        uuid id PK
        uuid org_id FK
        uuid user_id FK
        enum role
    }
    PROJECTS {
        uuid id PK
        uuid org_id FK
        string name
        timestamp deleted_at
    }
    TASKS {
        uuid id PK
        uuid project_id FK
        string title
        enum status
        enum priority
        timestamp due_date
        timestamp deleted_at
        tsvector search_vector
    }
    TASK_ASSIGNMENTS {
        uuid id PK
        uuid task_id FK
        uuid user_id FK
        uuid assigned_by_id FK
        enum notification_status
    }
    COMMENTS {
        uuid id PK
        uuid task_id FK
        uuid author_id FK
        string body
    }
    REFRESH_TOKENS {
        uuid id PK
        uuid user_id FK
        string token_hash UK
        timestamp expires_at
        timestamp revoked_at
    }
```

Full CASCADE/RESTRICT rationale per relation is in [README.md §5](./README.md#5-database-design) and inline in `prisma/schema.prisma`.

## 7. Consistency Strategy for Assignment + Queue

Restated from the README for completeness, since this is one of the assignment's explicit "document your reasoning" requirements:

> **The task_assignment row in Postgres is the source of truth.** Once that INSERT commits, the assignment is real and the API returns success - no matter what happens to the email job afterward. Enqueueing into BullMQ/Redis is treated as a best-effort side effect: if it throws, we catch it, record `notification_status = 'failed'` on the assignment row, and log the error, but we do **not** roll back the assignment or fail the request. A background reconciliation sweep in the Worker process (every 60s, plus once at startup) scans for assignments stuck in `pending`/`failed` and retries enqueueing them, capped at 5 sweep attempts. This makes the *notification* eventually consistent while keeping the *assignment* - the operation the user actually asked for and is waiting on - immediately consistent and never blocked on Redis being healthy.

Trade-off accepted: a Redis outage at the exact moment of assignment delays that one email by up to ~60s (until the next sweep) rather than failing the assignment API call. Given email delivery is explicitly mocked/non-critical for this assignment, this is the right side to fail open on.

## 8. Important Design Decisions

- **Offset pagination**, not cursor-based (see README §19).
- **Registration self-creates an org** (registrant is `org_admin`); joining another org is an explicit admin action, never a public "join any org" endpoint.
- **Active org = most-recently-joined membership** at login/refresh time, since a full org-switcher UI/endpoint is out of scope.
- **Refresh tokens stored as SHA-256 hashes**, with rotation and reuse detection (revokes the whole session family).
- **Soft delete** (`deleted_at`) for `projects`/`tasks`; every repository read filters it out.
- **Full-text search** via a generated (`STORED`) `tsvector` column + GIN index, so PostgreSQL keeps it in sync automatically with no application-level trigger code.
