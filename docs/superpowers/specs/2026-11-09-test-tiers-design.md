# Three-tier test plan: unit, component, blackbox

Date: 2026-11-09. Status: built in the same change. Requested as: generate a test plan for all unit tests, component tests and blackbox tests for Java and NestJS apps; component tests run against MockMvc or its NestJS equivalent with stubs; blackbox tests run against the standalone app with stubs; the plan must cover every end-to-end scenario.

## Intent

Both comparison runs (`docs/exercise/2026-10-31-jstack-vs-pstack.md`, `docs/exercise/2026-11-06-jstack-vs-pstack-reserve-backend.md`) showed the same gap: jstack's test plan is one row per change, so it proves methods and never proves that a request reaches the code. The first run shipped no executed route test; the second shipped routes that stayed dark for three PRs. A plan that names every end-to-end scenario up front, and ties each scenario to a component test and a blackbox test, closes both gaps at planning time, where they are cheapest.

## Goals

- Every implementation plan carries four test tables: unit tests per change row, an end-to-end scenario list derived from the requirement and the diagrams, component tests keyed to scenarios, blackbox tests keyed to scenarios.
- Every scenario is covered by at least one component test and at least one blackbox test. Every sequence diagram is exercised by at least one scenario. The checker refuses a plan that breaks either rule.
- One vocabulary for Java/Spring and NestJS repos, with a reference recipe per stack for each tier.
- The PR plan assigns every component and blackbox test to exactly one PR, and a PR carrying a blackbox test must leave that scenario reachable in the booted app.
- The repo profile records how each tier runs on this machine, including how the app boots standalone with stubs, or why it cannot.
- The verifier runs each tier and the report shows a line per tier.

## Non-goals

- Running blackbox tests in CI, or against a shared environment. They run on the developer's or the agent's machine against a locally booted app.
- UI, browser or mobile testing.
- Contract testing between services (consumer-driven contracts). Stubs here are hand-written or recorded, owned by the test.
- Performance testing.

## Anti-goals

- A plan that lists scenarios nobody can run. Every blackbox row names the boot recipe it depends on, and the profile says whether that recipe works here.
- Component tests that mock the class under test, or blackbox tests that reach into the process. A tier is defined by what is real and what is stubbed, and the skill text says so in one table.
- Prose that repeats a table. The tables are the plan.

## Definitions (the calls I made)

| Tier | Real | Stubbed | Java/Spring harness | NestJS harness |
|---|---|---|---|---|
| Unit | one class or function | every collaborator | JUnit 5, Mockito | Jest, `Test.createTestingModule` with `useValue` mocks or plain constructor |
| Component | the HTTP layer and every class in the process: controller, pipes or filters, service, mappers | outbound dependencies at the process edge: repositories, HTTP clients, queues, clock | MockMvc via `@WebMvcTest` with `@MockBean`, or `MockMvcBuilders.standaloneSetup` with hand stubs when the app's context is heavy | `Test.createTestingModule({ imports: [FeatureModule] })` with `overrideProvider` and `overrideGuard`, `app.init()`, supertest against `app.getHttpServer()` |
| Blackbox | the built artifact booted as its own process on a real port | every external system: database, other services, queues, third-party APIs, replaced by stubs the test controls out of process | packaged jar or `bootRun` with a test profile; WireMock for HTTP dependencies; an embedded or containerised database per the profile | `node dist/main.js` or `nest start` with env pointing at stubs; a stub HTTP server (WireMock or a small Node server) for HTTP dependencies; a database per the profile |

An end-to-end scenario is one observable interaction: an actor, a starting state, one request or command, and the observable result, including the side effect on a stubbed dependency when the requirement cares about it. Scenarios are derived mechanically: one per sequence diagram flow, one per `alt`/`else` branch in a diagram, one per validation rule and per authorisation outcome in the requirement.

Ids: `C-n` change rows (unchanged), `S-n` scenarios, `CT-n` component tests, `BB-n` blackbox tests. Unit rows stay keyed by `C-n`.

## Where it lands

- New skill `skills/test-tiers/SKILL.md` with `references/java-spring.md` and `references/nestjs.md`.
- `skills/implementation-plan`: template, example and checker gain the four tables under `## Test plan` as H3 sections `Unit tests`, `E2E scenarios`, `Component tests`, `Blackbox tests`, in that order.
- `skills/pr-plan`: `Tests.` label lists the `CT-n` and `BB-n` ids the PR delivers; checker verifies each id lands in exactly one PR; heuristic and reviewer rule for blackbox reachability.
- `skills/repo-profile`: Commands table gains `test unit`, `test component`, `test blackbox` and `blackbox boot` rows; Test layout gains a stubs line; limit raised to 100 lines.
- `skills/verification-bundle`: Test summary gains `Component:` and `Blackbox:` lines; checker requires them; `Blackbox: not run (<reason>)` is allowed and visible.
- Agents and commands updated so the planner, splitter, implementer, verifier, reviewer and explorer read or produce the new rows.

## Constraints

- Node 20 built-ins only in checkers. No new dependencies in the plugin.
- Old plans without the four tables fail the new checker. Bundles from before this change already fail on `Audits`; this is the same policy.
- Harness trees (`harness/cursor`, `harness/codex`) are regenerated, never edited.

## Left to the builder

Exact wording of the stack recipes, the example plan's scenarios, and the test names in the checkers.
