# Test tiers on Java and Spring

Applies to Spring Boot 2.x and 3.x with JUnit 5. Adjust package names and the build tool (Gradle or Maven) to the repo profile.

## Unit

- Harness: JUnit 5, Mockito (`@ExtendWith(MockitoExtension.class)`, `@Mock`, `@InjectMocks`) or plain constructors.
- Location: `src/test/java/<package>/<Class>Test.java`, one test class per production class.
- Command: Gradle `./gradlew test --tests '<fqcn>'`; Maven `mvn -Dtest=<Class> test`.
- Rule: no Spring context. A test that needs `@SpringBootTest` to construct one class is a sign the class has too many collaborators.

## Component

Two harnesses, pick by context weight.

**`@WebMvcTest` with `@MockBean`.** Loads the controller slice: controllers, `@ControllerAdvice`, filters, converters, interceptors registered as beans, security config when `spring-security` is present. Services and repositories are `@MockBean` stubs.

```java
@WebMvcTest(PreferencesController.class)
@Import({GlobalExceptionHandler.class, WebAndSecurityConfig.class})
class PreferencesControllerComponentTest {
  @Autowired MockMvc mvc;
  @MockBean CustomerPreferencesService service;
  @MockBean RequestHeaderInterceptor interceptor; // stub only what the slice needs

  @Test
  @DisplayName("S-1: saves preferences for the session customer") // scenario id first; the reporter name carries it
  void savesPreferencesForTheSessionCustomer() throws Exception {
    given(service.save(eq("c-1"), any())).willReturn(new Preferences(...));
    mvc.perform(put("/api/v1/preferences/dietary").sessionAttr("customer", session("c-1"))
        .contentType(APPLICATION_JSON).content("{\"data\":[\"vegan\"]}"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.data[0]").value("vegan"));
    then(service).should().save("c-1", List.of("vegan"));
  }
}
```

**`MockMvcBuilders.standaloneSetup`.** No context at all. Build the controller with hand-written stubs and register the advice, interceptors and message converters the production app uses. Faster, and the right choice when the application context pulls in a database or a message broker at startup. The price: anything the production app registers in its context (interceptor path patterns, a global `ObjectMapper`) must be added by hand or the test proves a different app.

```java
MockMvc mvc = MockMvcBuilders.standaloneSetup(new PreferencesController(serviceStub))
    .setControllerAdvice(new GlobalExceptionHandler())
    .addInterceptors(new RequestHeaderInterceptor(sessionStub)).addMappedInterceptors(...)
    .build();
```

- Stubs: Mockito stubs (`given`/`willReturn`) for services and repositories. For an HTTP client the service calls, stub the client interface, not the transport.
- Location: `src/test/java/<package>/<Controller>ComponentTest.java`.
- Command: `./gradlew test --tests '*ComponentTest'`. Record it as `test component` in the profile.
- Rule: assert through `MockMvc` result matchers on status, headers and `jsonPath`, and on the stub with `then(...).should()`. Never call the controller method directly.

## Blackbox

- Harness: the packaged artifact (`build/libs/<app>.jar` or `target/<app>.jar`) started with `java -jar` and a test profile (`--spring.profiles.active=blackbox`), or `./gradlew bootRun --args='--spring.profiles.active=blackbox'` when packaging is slow. The test process talks to it with `java.net.http.HttpClient`, RestAssured or `TestRestTemplate` over `http://localhost:<port>`.
- Stubs: WireMock standalone (`wiremock-standalone.jar --port 8089`) or the WireMock JUnit extension running in the test JVM; each external HTTP dependency's base URL is set to the stub through the test profile. Database: an embedded H2 with the schema migrated, or a Testcontainers MySQL/Postgres when the repo already uses Testcontainers; the profile row says which is available on this machine. Queues and schedulers: a profile flag that disables them, or a stub broker.
- Ready probe: `GET /actuator/health` returning `{"status":"UP"}`, or the first `Started <App>Application` log line when actuator is absent. Poll with a deadline; fail the suite with the app's log tail when it is not reached.
- Location: `src/blackboxTest/java/...` as a separate Gradle source set, or `src/test/java/<package>/blackbox/` tagged `@Tag("blackbox")` and excluded from the default `test` task.
- Command: `./gradlew blackboxTest` (source set) or `./gradlew test -PincludeTags=blackbox`. Record it as `test blackbox`, and the boot sequence as `blackbox boot`: build, start command, env or profile that points at stubs, ready probe, stop.
- Rule: the app's own configuration surface carries the stub addresses. The test never edits application code, never shares a JVM with the app, and stops the process it started by PID.

## Profile rows this stack produces

| Purpose | Command | Notes |
|---|---|---|
| test unit | `./gradlew test --tests '*Test' -x blackboxTest` | excludes component and blackbox by name pattern or tag |
| test component | `./gradlew test --tests '*ComponentTest'` | MockMvc, no database |
| test blackbox | `./gradlew blackboxTest` | needs `blackbox boot` |
| blackbox boot | `./gradlew bootJar && java -jar build/libs/<app>.jar --spring.profiles.active=blackbox` | ready: `GET :8080/actuator/health` is UP; stubs: WireMock :8089, H2 in memory; or `unavailable (<reason>)` |
