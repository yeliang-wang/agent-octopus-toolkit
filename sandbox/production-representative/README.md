# Production Representative Sandbox

The Production Representative Sandbox gives Octopus agents a shared local project set for release coverage matrix loops when real customer production projects are not available.

It is not a shortcut around production evidence. The sandbox creates representative projects, but they count only when the target loop uses real repositories, real validation commands, real target-product registration, real SCM, real CI/CD, real LLM/runtime boundaries, and persisted product-native evidence. Template-only, mock-only, fixture-only, smoke-only, or chat-only projects do not count as release evidence.

## Project Set

| Project | Represents | Coverage Tags |
| --- | --- | --- |
| `node-service` | Backend API service | backend, API, configuration, CI/CD, code upgrade |
| `web-dashboard` | Dashboard and user-flow surface | frontend, dashboard, user flow, artifact, CI/CD |
| `mcp-tooling` | MCP/tool contract boundary | MCP, tool schema, agent boundary, contract, CI/CD |
| `data-pipeline` | Evidence and audit data path | data, evidence, audit, idempotency, CI/CD |
| `flaky-quality-gate` | Release blocker and repair verification | quality gate, failure containment, repair verification, release blocker, CI/CD |

## Create Local Repositories

From the toolkit root:

```bash
python3 sandbox/production-representative/scripts/create-projects.py --force
```

The command writes generated repositories under:

```text
data/production-representative-sandbox/projects/
```

That directory is intentionally ignored by git. Each generated project is initialized as a real Git repository and runs its own validation commands.

## Verify

Verify the source contract:

```bash
python3 sandbox/production-representative/scripts/verify-sandbox.py
```

Verify generated repositories:

```bash
python3 sandbox/production-representative/scripts/verify-sandbox.py --generated
```

Verify the intentional blocker path:

```bash
python3 sandbox/production-representative/scripts/verify-sandbox.py --generated --include-fault
```

The fault check must fail inside the representative project and be reported as a release blocker until repaired by the target loop.

## Jenkins Jobs

Generate Jenkins job XML files:

```bash
python3 sandbox/production-representative/scripts/create-jenkins-jobs.py
```

Create or update real Jenkins jobs only when a real Jenkins endpoint is available:

```bash
JENKINS_URL=http://jenkins.example.com \
JENKINS_USER=... \
JENKINS_TOKEN=... \
python3 sandbox/production-representative/scripts/create-jenkins-jobs.py --apply
```

If Jenkins cannot access the generated project repositories or an SCM mirror of them, CI/CD coverage is `BLOCKED`; do not replace it with an internal fixture.

## EvoPilot Registration

The EvoPilot target profile lives at:

```text
sandbox/production-representative/profiles/evopilot.release-matrix.json
```

Print the registration plan:

```bash
python3 sandbox/production-representative/scripts/register-target.py \
  --target evopilot \
  --base-url http://127.0.0.1:3000
```

Apply it only against a running EvoPilot service with a real token:

```bash
EVOPILOT_API_TOKEN=... \
python3 sandbox/production-representative/scripts/register-target.py \
  --target evopilot \
  --base-url http://127.0.0.1:3000 \
  --apply
```

Release coverage starts only after EvoPilot returns the registered projects from `GET /api/v1/projects` with `VERIFIED` validation.

## Shared Agent Contract

All packaged agents may read `manifest.json`:

- Use ProofOps for production lifecycle release coverage matrix governance.
- `mcp-e2e-governor` uses `mcp-tooling` for MCP contract lifecycle validation.
- `user-flow-debug` uses `web-dashboard` for real UI flow checks.
- `scm-sync-governor` validates Git, branch, commit, and CI boundaries.
- `product-evolution-lab` runs cross-project product evolution pressure.

Every phase report must still print the decision chain: `phase`, `evidence`, `rule`, `options`, `decision`, `rationale`, and `nextAction`.

## Generic Project Profiles

Target products should expose sandbox registration and release evidence through a generic `agent-octopus-project-profile/v1` profile. The EvoPilot GA profile in `project-profiles/examples/evopilot.ga.json` is an example, not a toolkit-core dependency. Other projects should provide their own health endpoints, commands, external-boundary checks, release evidence endpoint, and release decision endpoint while preserving the same production evidence rules.
