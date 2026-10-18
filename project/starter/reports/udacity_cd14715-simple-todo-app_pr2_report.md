# 🔍 Code Review Report

## Summary

| Metric | Value |
|--------|-------|
| **Overall Score** | 35/100 |
| **Files Reviewed** | 1 |
| **Critical Issues** | 3 |
| **High Priority Tests** | 15 |
| **Refactoring Opportunities** | 8 |

## 🎯 Top Recommendations

1. 🚨 **Security - SQL Injection**: Fix three SQL injection vulnerabilities immediately. The searchTodos, searchTodosByStatus, and getTodosByUser functions use string concatenation/interpolation instead of parameterized queries, allowing attackers to execute arbitrary SQL. This could lead to data theft, modification, or deletion of the entire database.
   - Files: src/todo.ts

2. 🚨 **Security - Testing**: Create security tests for all three vulnerable functions with SQL injection payloads (e.g., "'; DROP TABLE todos; --", "' OR '1'='1") to demonstrate vulnerabilities exist, then validate fixes prevent injection attacks.
   - Files: src/todo.ts

3. ⚠️ **Security - Authorization**: Implement authorization checks in updateTodoStatus and deleteTodo functions to prevent Insecure Direct Object Reference (IDOR) vulnerabilities. Currently any user can modify or delete any todo without ownership verification (OWASP A01: Broken Access Control).
   - Files: src/todo.ts

4. ⚠️ **Testing - Core Functions**: Add comprehensive test suite for all 11 functions. Currently there is ZERO test coverage. Start with security-critical functions (validateTodoInput, sanitizeInput) and data mutation functions (createTodo, updateTodoStatus, deleteTodo).
   - Files: src/todo.ts

5. ⚠️ **Error Handling**: Add proper error handling throughout all database operations. Functions like getAllTodos, updateTodoStatus, and deleteTodo lack try-catch blocks and don't verify operation success (e.g., checking rowCount for updates/deletes).
   - Files: src/todo.ts

6. ⚠️ **Input Validation**: Add input validation to all functions that accept user input. Functions like getTodoById, updateTodoStatus, deleteTodo, and all search functions don't validate parameter types or formats, risking unexpected behavior and database errors.
   - Files: src/todo.ts

7. 📝 **Type Safety**: Fix type mismatch in searchTodosByStatus - parameter is typed as string but should be boolean to match database schema. This creates confusion and potential runtime errors. Convert at API boundary, not in data layer.
   - Files: src/todo.ts

8. 📝 **Code Quality - Refactoring**: Extract common search query logic into a reusable helper function. The three search functions duplicate database query patterns with only filter criteria changing, violating DRY principle and increasing maintenance burden.
   - Files: src/todo.ts

9. 📝 **Performance**: Add pagination to getAllTodos function. Loading all records without limits will cause memory issues and poor performance as data grows. Implement LIMIT and OFFSET parameters with sensible defaults (e.g., 100 items per page).
   - Files: src/todo.ts

10. 📝 **Security - ID Generation**: Replace Math.random() based ID generation with crypto.randomUUID() for cryptographically secure, guaranteed unique IDs. Current approach is predictable and could produce collisions in concurrent scenarios.
   - Files: src/todo.ts

11. 📝 **Data Model**: Add userId field to Todo interface. The getTodosByUser function implies multi-user functionality exists, but the Todo interface lacks userId field, creating inconsistency about data ownership model.
   - Files: src/todo.ts

12. 💡 **Performance - Query Optimization**: Replace LIKE queries with leading wildcards ('%keyword%') with full-text search (PostgreSQL tsvector/tsquery or Elasticsearch). Current approach prevents index usage and causes full table scans, becoming very slow on large datasets.
   - Files: src/todo.ts

13. 💡 **Error Handling - Custom Errors**: Create custom error classes (ValidationError, NotFoundError, DatabaseError) instead of generic Error objects. This enables type-safe error handling and makes it easier for callers to handle specific error cases programmatically.
   - Files: src/todo.ts

14. 💡 **Best Practice - Sanitization**: Remove unnecessary sanitizeInput calls before database storage when using parameterized queries. Sanitization should be context-specific at output time (HTML rendering vs JSON API), not at storage. Current approach could cause data loss if special characters are legitimate.
   - Files: src/todo.ts

## 📁 File Details

### 📄 `src/todo.ts`

**Quality Score:** 35/100 | **Coverage:** ~0%

#### Issues (23)
  - Line 120: `critical` SQL Injection vulnerability in searchTodos function. User input is directly interpolated into SQL query using template literals without parameterization. An attacker could execute arbitrary SQL commands by passing malicious input like "'; DROP TABLE todos; --".
  - Line 129: `critical` SQL Injection vulnerability in searchTodosByStatus function. User input is concatenated directly into SQL query w
  - Line 139: `critical` SQL Injection vulnerability in getTodosByUser function. userId is directly embedded in SQL query using template literals without sanitization or parameterization. An attacker could manipulate the query to access unauthorized data or execute arbitrary SQL.
  - Line 42: `medium` Manual XSS sanitization is fragile and error-prone. The sanitizeInput function only handles basic HTML entities but misses many XSS vectors (JavaScript events, CSS expressions, encoded characters, etc.). This provides false sense of security.
  - Line 129: `high` Type mismatch in searchTodosByStatus function. Parameter 'completed' is typed as string but should be boolean to match the database schema and Todo interface. This creates confusion and potential runtime errors.
  - Line 77: `high` Missing error handling for database operations in createTodo. If the database query fails, the error will propagate without context. Additionally, there's no check for duplicate IDs or constraint violations.
  - Line 84: `high` getAllTodos lacks error handling and pagination. Loading all todos without limits could cause memory issues and poor performance as data grows. No defensive programming for malformed database responses.
  - Line 101: `medium` updateTodoStatus doesn't verify if the todo exists before updating. This could silently succeed even when updating non-existent records, providing no feedback to the caller about whether the operation was meaningful.
  - Line 108: `medium` deleteTodo doesn't verify if the todo exists before deletion. Similar to updateTodoStatus, it provides no indication whether a record was actually deleted.
  - Line 148: `medium` generateId function uses Math.random() which is not cryptographically secure and could produce collisions. The timestamp + random approach is predictable and doesn't guarantee uniqueness in concurrent scenarios.
  - Line 90: `medium` Missing input validation in getTodoById. The function doesn't validate the id parameter format, which could lead to unexpected behavior or database errors with malformed input.
  - Line 101: `medium` Missing input validation in updateTodoStatus. The id parameter is not validated, and there's no authorization check to ensure the user has permission to update this specific todo.
  - Line 108: `high` Missing authorization check in deleteTodo. Any authenticated user could potentially delete any todo without ownership verification. This is an Insecure Direct Object Reference (IDOR) vulnerability (OWASP A01: Broken Access Control).
  - Line 10: `medium` Todo interface missing userId field for multi-user support, but getTodosByUser function implies multi-user functionality exists. This inconsistency creates confusion about data ownership model.
  - Line 77: `low` Database query result types are cast using 'as Todo[]' without runtime validation. If database schema doesn't match TypeScript interface, this could cause subtle bugs. Date fields may be returned as strings.
  - Line 1: `medium` Missing error type definitions. Functions throw generic Error objects with string messages, making it difficult for callers to handle specific error cases programmatically.
  - Line 25: `low` validateTodoInput returns boolean instead of throwing descriptive errors. Callers only get true/false without knowing what validation failed, making debugging and user feedback difficult.
  - Line 120: `low` searchTodos uses LIKE with leading wildcard ('%keyword%') which prevents index usage and causes full table scans. This will be very slow on large datasets.
  - Line 84: `low` getAllTodos fetches all columns with SELECT * which is inefficient if only specific fields are needed. This wastes bandwidth and memory, especially as the Todo interface grows.
  - Line 53: `info` Sanitization applied before storage is unnecessary when using parameterized queries. Sanitization should be context-specific at output time (HTML rendering vs JSON API), not at storage. This could cause data loss if special characters are legitimate.
  - Line 5: `info` Missing explicit return type on db.query calls. The database module interface is unclear, making it hard to understand what query() returns (rows array, result object, etc.).
  - Line 120: `low` No input length validation for searchTodos keyword parameter. An empty string or very long search term could cause performance issues or unexpected behavior.
  - Line 53: `low` Missing JSDoc comments for input parameters and return types. Functions have descriptions but lack @param and @returns tags for better IDE support and documentation generation.

#### Test Gaps (27)
  - `searchTodos (lines 119-123)` (critical priority)
  - `searchTodosByStatus (lines 128-133)` (critical priority)
  - `getTodosByUser (lines 138-143)` (critical priority)
  - `validateTodoInput (lines 23-33)` (high priority)
  - `validateTodoInput - title boundary (line 26)` (high priority)
  - `validateTodoInput - description boundary (line 29)` (medium priority)
  - `sanitizeInput (lines 38-44)` (high priority)
  - `sanitizeInput - empty string (line 38)` (medium priority)
  - `createTodo (lines 49-69)` (high priority)
  - `createTodo - validation failure (line 50)` (high priority)
  - `createTodo - description optional (line 52)` (medium priority)
  - `getAllTodos (lines 74-77)` (high priority)
  - `getAllTodos - empty result (line 76)` (medium priority)
  - `getTodoById (lines 82-91)` (high priority)
  - `getTodoById - not found (line 88)` (high priority)
  - `getTodoById - empty/null ID (line 82)` (medium priority)
  - `updateTodoStatus (lines 96-99)` (high priority)
  - `updateTodoStatus - non-existent ID (line 97)` (medium priority)
  - `deleteTodo (lines 104-107)` (high priority)
  - `deleteTodo - non-existent ID (line 105)` (medium priority)
  - `generateId (lines 148-150)` (medium priority)
  - `generateId - uniqueness (line 149)` (low priority)
  - `createTodo - database error handling (line 66)` (high priority)
  - `searchTodos - empty keyword (line 119)` (high priority)
  - `searchTodos - special LIKE characters (line 121)` (high priority)
  - `searchTodosByStatus - non-boolean input (line 130)` (critical priority)
  - `getTodosByUser - empty userId (line 138)` (high priority)

#### Refactoring Opportunities (8)
  - **pattern-improvement**: All three search functions duplicate database query logic with only filter criteria changing. This is a security and maintainability risk. Extract common query pattern into a private helper function that accepts filter parameters and uses parameterized queries consistently.
  - **modernize**: If these functions use callback-based database queries or .then() chains, modernize to async/await for better error handling and readability. Add input validation using optional chaining and nullish coalescing to handle edge cases safely.
  - **simplify**: The 'completed' parameter is a string but should be a boolean type. Remove string-to-boolean conversion logic and use proper typing. If the API receives strings, validate and convert at the boundary (controller/route handler), not in the data layer.
  - **extract-function**: Input sanitization and validation logic is likely duplicated or missing across search functions. Extract validation into a dedicated helper function that checks for SQL injection patterns, validates input length, and sanitizes user input before passing to database queries.
  - **extract-function**: User ID validation and authorization check should be extracted into a separate function. This logic likely needs to verify the user exists and the current user has permission to query that user's todos.
  - **modernize**: Add explicit TypeScript return types and use a consistent Todo interface. Replace 'any' types with properly typed interfaces. Consider using a Result type or discriminated union for error handling instead of throwing exceptions.
  - **simplify**: If search functions contain nested conditionals for building dynamic WHERE clauses, simplify using an array-based query builder pattern with early returns for empty filters.
  - **pattern-improvement**: Implement a consistent error handling strategy across all search functions. Use custom error classes that match those in createTodo and getTodoById (ValidationError, NotFoundError, DatabaseError) instead of generic Error throws.

---

*Generated at 2026-10-18T00:00:00Z • Duration: 0ms*
