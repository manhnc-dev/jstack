# Test tiers on NestJS

Applies to NestJS 8 to 10 with Jest and TypeORM, Prisma or Mongoose. Adjust to the repo profile.

## Unit

- Harness: Jest. Either construct the class directly with mocks, or `Test.createTestingModule({ providers: [Service, { provide: getRepositoryToken(Entity), useValue: repoMock }] })`.
- Location: beside the source as `<name>.spec.ts`.
- Command: `npx jest <path> --forceExit`.
- Rule: no `app.init()`, no HTTP. A test that needs the module's imports to construct one service is a sign of hidden coupling.

## Component

- Harness: Nest's testing module with the feature module imported, outbound providers replaced, guards overridden, the app initialised, and supertest against the real HTTP server.

```ts
const moduleRef = await Test.createTestingModule({ imports: [OperationNotesModule] })
  .overrideProvider(getRepositoryToken(OperationNote)).useValue(repoStub)
  .overrideGuard(JwtOutletAuthGuard).useValue({ canActivate: (ctx) => { ctx.switchToHttp().getRequest().user = outletUser; return true; } })
  .compile();
const app = moduleRef.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true })); // mirror main.ts
app.useGlobalFilters(new HttpExceptionFilter());                              // mirror main.ts
await app.init();
await request(app.getHttpServer()).get('/api/v1/operation-notes?from=2026-06-01&to=2026-06-07').expect(200);
```

- Mirror the bootstrap. Whatever `main.ts` installs globally (pipes, filters, interceptors, versioning, body limits) changes status codes and shapes. A component test without them proves a different app. Put the mirror in one shared helper (`src/test/component-app.ts`) so every component spec uses the same one, and keep a second bare setup only when the plan needs to show the difference.
- Stubs: `overrideProvider` for repositories, HTTP clients (the service wrapping axios or fetch, not the transport), queues and clocks. `overrideGuard` to set the authenticated user; keep one scenario that uses the real guard with a real token when the requirement has an authorisation outcome.
- Location: `<feature>.controller.spec.ts` or `<feature>.component.spec.ts` beside the module. When the repo excludes a pattern from the default run, follow it.
- Command: `npx jest src/modules/<feature> --forceExit`, or a `--testPathPattern` for `component.spec` when the repo separates them. Record it as `test component`.
- Titles: `it('S-2: returns 422 for an impossible date', ...)`. One `it` per scenario, the scenario id first, in component and blackbox specs alike.
- Rule: assert status and body through supertest and the stub interaction through `expect(repoStub.save).toHaveBeenCalledWith(...)`. Never call the controller method.

## Blackbox

- Harness: build (`npm run build`), start the artifact as a child process (`node dist/main.js`) with `NODE_ENV` and the dependency URLs pointing at stubs, wait for the ready probe, run the scenarios over HTTP with supertest or `fetch` against `http://localhost:<PORT>`, then kill the child by PID.
- Stubs: a stub HTTP server the test starts (a small Node `http` server in `test/blackbox/stubs/`, or WireMock standalone when the repo already ships Java), one per external service, recording requests for assertions. Database: the repo's docker compose test service, or SQLite when the ORM and entities allow it; the profile row says which exists on this machine. Redis, MQTT and queues: a stub or the compose service, named in the row.
- Ready probe: the app's health route, or the `Nest application successfully started` log line. Poll with a deadline.
- Location: `test/blackbox/<feature>.bb.spec.ts` with its own Jest config (`test/jest-blackbox.json`) so the default `npm test` never boots the app.
- Command: `npx jest --config test/jest-blackbox.json --runInBand --forceExit`. Record it as `test blackbox`, and the boot sequence as `blackbox boot`.
- Rule: the app reads stub addresses from env. The test owns the stubs' lifecycle, never imports application modules, and never patches application code.

## Profile rows this stack produces

| Purpose | Command | Notes |
|---|---|---|
| test unit | `npx jest --testPathIgnorePatterns 'component.spec' --forceExit` | or the repo's default when unit and component share a run |
| test component | `npx jest src/modules --testPathPattern 'controller.spec|component.spec' --forceExit` | Nest TestingModule + supertest, bootstrap mirrored |
| test blackbox | `npx jest --config test/jest-blackbox.json --runInBand --forceExit` | needs `blackbox boot` |
| blackbox boot | `npm run build && PORT=3999 DB_HOST=... PAYMENTS_URL=http://localhost:8089 node dist/main.js` | ready: `GET :3999/health` 200; stubs: `test/blackbox/stubs/*.mjs`; DB: compose service `mysql-test`; or `unavailable (<reason>)` |
