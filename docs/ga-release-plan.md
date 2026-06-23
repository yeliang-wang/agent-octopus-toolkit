# Stable GA Release Plan

This plan tracks the evolution from the current public-beta bar to a stable GA release.

## Current State

Current release target: `public-beta`.

The public-beta gate proves that packaged agents are installable, loop-capable, drift-checkable, generated from canonical sources, and auditable from the local checkout. It does not prove stable GA.

Run:

```bash
npm run release:check
```

Stable GA readiness is checked separately:

```bash
npm run release:check:ga
npm run release:check:ga -- --json
```

The stable GA gate is allowed to fail while the platform is still hardening. Failed stable-GA checks are the authoritative blocker list.

## Phases

| Phase | Goal | Exit Gate |
| --- | --- | --- |
| P0 GA scope | Define stable GA scope, non-goals, criteria, and support boundary. | `docs/ga-criteria.md` and `docs/support-matrix.md` exist. |
| P1 CI release gate | Run public-beta and stable-GA checks in GitHub Actions. | `.github/workflows/ci.yml` and `.github/workflows/release-check.yml` exist and pass on PRs. |
| P2 real project evidence | Add at least three release project profiles and capture final reports from real boundaries. | Stable-GA project-profile checks pass. |
| P3 product entrypoint | Promote internal runner commands into a stable CLI surface. | Documented `octopus release ...` or equivalent command path with compatibility policy. |
| P4 contract stability | Version schemas and add migration/compatibility checks. | Schema compatibility tests and migration notes pass. |
| P5 stable release | Cut a tagged release with release-readiness artifacts and changelog. | Stable-GA gate passes and release notes identify GA/non-GA components. |

## Loop Execution Policy

Each GA hardening loop iteration must:

1. Re-read the newest user instruction and current checkout state.
2. Run or update the relevant gate.
3. Implement only changes that can be verified locally.
4. Treat missing real services, missing credentials, or missing target projects as `BLOCKED`, not as simulated success.
5. End with a concise report: completed work, commands run, failed checks, next blocker.

## Stable GA Blocker Classes

| Blocker | Meaning | Required Action |
| --- | --- | --- |
| lifecycle | One or more GA-scoped agents/plugins are still `beta`. | Promote only after real project evidence exists. |
| ci | Release gates do not run in GitHub Actions. | Add workflows and keep public-beta gate green. |
| evidence | Fewer than three real release project profiles exist. | Add and run project profiles with real boundaries. |
| distribution | No tagged release artifact or changelog. | Add release workflow, changelog, and release notes template. |
| contract | Schema changes have no compatibility story. | Add migration notes and compatibility tests. |
| operability | Users cannot diagnose install, drift, runner, or release failures. | Add failure guide and support matrix. |

## First GA Candidate

The first GA candidate should be scoped to:

- shared release coverage matrix runner
- project profile schema and runner contract
- Codex project-scoped install and drift check

The remaining agents can stay beta until they collect their own repeated real-project evidence.
