# Docker runtime

The container runs a Next.js production build through `scripts/serve-container.mjs`.
The custom server retains the existing banking, conversation, transfer, purchase,
healthz and version handlers. All other requests pass to Next.js, including pages,
static assets, `/health`, `/ready` and `/api/v1/*`.

Do not set `output: 'export'` or delete App Router routes during the build: the
unified Agent routes require a Node.js runtime. The runtime image copies `.next`
instead of the former `out` directory. `/ready` retains its authentication and
database/skill readiness checks; `/health` remains a liveness check.

From the repository root in PowerShell:

```powershell
$env:FINEASE_GIT_SHA = (git rev-parse HEAD).Trim()
$env:FINEASE_GIT_DIRTY = if (git status --porcelain) { 'true' } else { 'false' }
docker compose --env-file .env.local -f compose.yaml -f compose.postgres.yaml build web pilot-migrate
docker compose --env-file .env.local -f compose.yaml -f compose.postgres.yaml up -d web mcp bridge
node --env-file=.env.local scripts/verify-container.mjs
Start-Process 'http://127.0.0.1:4300/'
```

This reuses the existing `finease-local-check` project and Postgres volume.
The smoke test checks page assets, legacy banking reads, dynamic Agent routes,
authentication, and version metadata without executing financial operations.
`gitDirty: "true"` in `/version` identifies local fixes on top of the reported SHA.
