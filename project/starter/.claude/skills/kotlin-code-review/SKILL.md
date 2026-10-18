---
description: Reviews Kotlin backend code built with Spring Boot for idioms, correctness, and framework-specific pitfalls
---

# Kotlin Code Review (Spring Boot)

Expert in idiomatic Kotlin and the Spring Boot framework as used in backend services (REST APIs, persistence, messaging).

## Kotlin Idioms
- Prefer `val` over `var`; treat mutability as an explicit, justified choice
- Use data classes for DTOs/entities instead of plain classes with manual `equals`/`hashCode`/`toString`
- Use named arguments and default parameter values instead of telescoping constructors/overloads
- Prefer expression bodies (`fun foo() = ...`) for simple functions
- Use `sealed class`/`sealed interface` for finite result/state hierarchies instead of open inheritance
- Use scope functions (`let`, `run`, `apply`, `also`, `with`) purposefully — not chained for their own sake
- Prefer extension functions over utility classes with static-style methods
- Use `require()`/`check()` for precondition/invariant validation instead of manual `if (...) throw`

## Null Safety
- Avoid `!!` outside of tests or truly invariant-guaranteed contexts; it reintroduces NPEs
- Model absence with nullable types (`T?`) and handle via `?.`, `?:`, or smart-cast `if (x != null)`
- Avoid platform types leaking from Java interop unchecked — annotate or wrap Java calls at the boundary
- Don't use empty string/`-1`/sentinel values as a substitute for `null`

```kotlin
// Bad
fun findUser(id: Long): User = repository.findById(id).get() // throws NoSuchElementException, unclear intent

// Good
fun findUser(id: Long): User =
    repository.findByIdOrNull(id) ?: throw UserNotFoundException(id)
```

## Coroutines & Concurrency
- Don't block in suspend functions (`Thread.sleep`, blocking JDBC calls) without `withContext(Dispatchers.IO)`
- Avoid `GlobalScope.launch` — use structured concurrency tied to a request/service scope
- Propagate `CoroutineContext`/cancellation correctly; don't swallow `CancellationException`
- Use `suspend` functions for I/O-bound Spring WebFlux handlers instead of mixing blocking and reactive code
- Guard shared mutable state with `Mutex` or actor pattern instead of `@Synchronized` in coroutine code

## Spring Boot: Dependency Injection & Bean Design
- Prefer constructor injection (`class FooService(private val bar: BarRepository)`) over field injection (`@Autowired lateinit var`)
- Avoid `lateinit var` for dependencies — constructor injection with `val` is null-safe and testable
- Keep `@Service`/`@Component` classes stateless; request-scoped mutable state belongs in the request, not the bean
- Avoid circular bean dependencies — refactor shared logic into a separate collaborator
- Use `@ConfigurationProperties` data classes for typed config instead of scattered `@Value` injections

## Spring Boot: Controllers & REST
- Validate request bodies with `@Valid` + Bean Validation annotations (`@NotBlank`, `@Size`, etc.), not manual checks scattered through the handler
- Return proper HTTP status codes via `ResponseEntity` or `@ResponseStatus`, not always `200 OK`
- Use `@ExceptionHandler`/`@ControllerAdvice` for centralized error mapping instead of try/catch in every controller method
- Never expose JPA entities directly as API responses — map to DTOs to avoid leaking internal fields or lazy-loading issues
- Version and namespace APIs consistently (`/api/v1/...`); avoid breaking changes to existing response shapes

## Spring Boot: Persistence (JPA/Exposed/R2DBC)
- Watch for N+1 query problems — use `@EntityGraph`, `JOIN FETCH`, or explicit batch fetching for associations
- Keep transaction boundaries at the service layer (`@Transactional` on service methods), not scattered in repositories or controllers
- Avoid `@Transactional` on public methods called from within the same class (self-invocation bypasses the proxy)
- Use `readOnly = true` on `@Transactional` for query-only methods to enable optimizations
- Avoid lazy-loading entity associations after the persistence context/session is closed (`LazyInitializationException`)
- Use database migrations (Flyway/Liquibase) for schema changes, never rely on `ddl-auto: update` in production

```kotlin
// Bad: entity leaked as API response, N+1 on orders
@GetMapping("/users/{id}")
fun getUser(@PathVariable id: Long): User = userRepository.findByIdOrNull(id)!!

// Good: DTO projection, explicit fetch
@GetMapping("/users/{id}")
fun getUser(@PathVariable id: Long): UserResponse {
    val user = userRepository.findByIdWithOrdersOrNull(id)
        ?: throw UserNotFoundException(id)
    return UserResponse.from(user)
}
```

## Error Handling & Exceptions
- Define a domain-specific exception hierarchy (e.g. `NotFoundException`, `ValidationException`) mapped centrally to HTTP statuses
- Don't catch generic `Exception`/`Throwable` and swallow it — log with context and rethrow or map appropriately
- Avoid using exceptions for expected control flow (e.g. validation results) — prefer `Result<T>`/sealed result types
- Ensure exception messages don't leak sensitive internals (stack traces, SQL) to API clients

## Testing
- Use `@SpringBootTest` sparingly (slow, full context); prefer slice tests (`@WebMvcTest`, `@DataJpaTest`) for focused coverage
- Mock collaborators with MockK (idiomatic for Kotlin) rather than Mockito's Java-oriented API where possible
- Use `@Test fun \`should return 404 when user not found\`()` backtick names for readable test intent
- Avoid testing through `Thread.sleep`; use `Awaitility` or deterministic test doubles for async code

## Security & Configuration
- Never commit secrets in `application.yml`; use environment variables or a secrets manager
- Apply method-level security (`@PreAuthorize`) or filter-based checks — don't rely on the client to hide unauthorized actions
- Validate and sanitize all external input at controller boundaries, even when an ORM parameterizes queries downstream
- Disable verbose Spring Boot error responses (`server.error.include-stacktrace: never`) in production profiles

## Common Anti-Patterns
- Overusing `!!` and `lateinit` as an escape hatch instead of modeling nullability/initialization correctly
- Fat controllers with business logic that belongs in a service layer
- Returning `Any`/`Any?` from service methods, losing type information
- Mutable `var` properties on shared singleton beans causing thread-safety bugs
- Catching and re-throwing exceptions without adding context (`throw RuntimeException(e)` loses cause chain when not passed)

## Output:
For each issue provide:
1. Description
2. Why problematic (correctness, safety, or Spring-specific pitfall)
3. Fix with code example
4. Severity level (critical/high/medium/low)
