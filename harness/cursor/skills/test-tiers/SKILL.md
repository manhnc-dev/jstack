---
name: test-tiers
description: The three test tiers every jstack plan carries (unit, component, blackbox), how end-to-end scenarios are derived from a requirement and its diagrams, and how each tier runs on Java/Spring and NestJS repos. Read when writing or reviewing a plan's Test plan section, when splitting tests across PRs, or when implementing or verifying a PR's tests.
---

# Test tiers

A jstack plan proves a change three ways. Unit tests prove each method. Component tests prove that a request through the real HTTP layer reaches the method and comes back with the right status and body, with everything outside the process stubbed. Blackbox tests prove the same scenarios against the built app running as its own process, with every external system replaced by a stub the test controls. The scenario list ties the three together: it is written before any test, and every scenario must be covered by a component test and a blackbox test.

## What is real in each tier

| Tier | Real | Stubbed | Proves |
|---|---|---|---|
| Unit | one class or function | every collaborator | the method does what its change row says |
| Component | the HTTP layer and every class inside the process (controller, pipes, filters, guards, service, mappers) | outbound dependencies at the process edge: repositories, HTTP clients, queues, clock | a request reaches the code and the contract (status, body, headers) holds |
| Blackbox | the built artifact booted as its own process on a real port, with its real wiring, config and middleware | every external system: database, other services, queues, third-party APIs, out of process | the deployable behaves as the scenario says, including its effect on dependencies |

A test belongs to a tier by what it stubs, not by where the file lives. A component test that mocks the service under test is a unit test with extra steps; a blackbox test that imports application classes is a component test. Name the tier honestly and the plan stays checkable.

## Deriving the scenarios

Write the scenario table before any test row, from three sources, in this order:

1. One scenario per sequence diagram flow. The happy path of `SD-n` is a scenario.
2. One scenario per `alt`/`else` branch in a diagram. Each branch is a different observable outcome.
3. One scenario per rule in the requirement that the diagrams do not already show: each validation rule, each authorisation outcome (missing credential, wrong permission, right permission), each "unchanged" claim about existing behaviour.

A scenario row is `ID | Flow | Actor | Given | When | Then | Diagrams`. `Actor` is who sends the request (a customer token, an outlet token with a named permission, an anonymous client, a scheduler). `Given` is the starting state the stubs must present. `When` is one request or command with its concrete input. `Then` is the observable result: status, body shape or exact values, and when the requirement cares, the call the stub must or must not have received. `Diagrams` lists the `SD-n` the scenario exercises; every diagram must appear in at least one row.

Pick concrete values a reviewer can check: `2026-02-30` rather than "an invalid date", `permissionOutlet: 999` rather than "a bad permission".

## Component tests

A component test row is `ID | Scenarios | Test file | Harness | Stubs | Asserts`. One row may cover several scenarios when they share a setup. `Harness` names the mechanism from the stack reference (`MockMvc @WebMvcTest`, `MockMvc standaloneSetup`, `Nest TestingModule + supertest`). `Stubs` names each stubbed dependency and how (`@MockBean OrderRepository`, `overrideProvider(getRepositoryToken(Note)).useValue(repoStub)`, `overrideGuard(JwtOutletAuthGuard)`). `Asserts` names status, body and the stub interaction when a scenario's `Then` includes one.

Rules:

- Drive the request through the real routing, not by calling the controller method. Status codes, serialisation, pipes, filters and guards are what this tier proves.
- Stub at the process edge only. The repository or client is stubbed; the service is real.
- When the production app installs global pipes, filters or interceptors in its bootstrap, mirror them in the harness, or the component test proves a different app. The stack reference shows how.
- Every `Then` that names a stub interaction is asserted on the stub (called with, not called).
- One test case per scenario, and its title starts with the scenario id: `S-3: seen key with a different payload conflicts`. The same holds for blackbox tests. Stack verification maps results to scenarios by that prefix, so a scenario with no titled test counts as failed.

## Blackbox tests

A blackbox test row is `ID | Scenarios | Test file | Boot | Stubs | Asserts`. `Boot` names the repo profile's `blackbox boot` row, or the command when the plan has to introduce one. `Stubs` names each external system and the stub that replaces it (`WireMock on :8089 for payments`, `MySQL via docker compose test profile`, `stub server test/blackbox/stubs/acme-eats.mjs`). `Asserts` names what is observed over the wire and, when the scenario cares, what the stub recorded.

Rules:

- Boot the built artifact, never an in-process application object. Wait for the ready probe the profile names; never sleep a fixed time.
- Point the app at stubs through its configuration surface (env, profile, config file). Never patch application code for a test.
- Stubs are owned by the test: started before the app, reset between scenarios, stopped after. Record requests the app makes so `Then` can assert on them.
- Ports come from configuration, so two runs never collide. Stop what you started by PID.
- When the profile's `blackbox boot` row is `unavailable`, the plan still lists the blackbox rows, the implementer still writes the tests, and the verifier records `Blackbox: not run (<reason>)`. The gap stays visible; the tests are ready for the machine that can run them.

## Coverage rule

Every `S-n` appears in at least one `CT-n` row and at least one `BB-n` row. Every `SD-n` appears in at least one `S-n` row. The plan checker refuses a plan that breaks either rule. A scenario that cannot be blackbox-tested on any machine (for example, one that needs a third party with no stub) is still listed, and its blackbox row says so in `Stubs` as `none possible: <reason>`; the row exists so the gap is counted.

## PR split rule

A PR that carries a blackbox test must leave that scenario reachable in the booted app at that PR's head: the route registered, the module wired, the flag on. A test that cannot pass until a later PR belongs to that later PR. This rule is what keeps a stack from shipping dark routes.

## Stack references

- Java and Spring: `references/java-spring.md`.
- NestJS: `references/nestjs.md`.

Each reference gives, per tier, the harness, how stubs are installed, where files live, the command the repo profile records, and the ready probe for blackbox runs.
