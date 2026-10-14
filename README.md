# Authentication & Authorization Service

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%2F6.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-Unit%20%26%20Integration-yellow.svg)](https://vitest.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-blueviolet.svg)](https://github.com/WiseLibs/better-sqlite3)

A high-performance, secure, and production-grade backend service built with TypeScript, Node.js, and Express. It validates OAuth2 JWT access tokens issued by an identity provider (e.g., Auth0) and evaluates fine-grained, hierarchical authorization decisions against an SQLite permissions database with deterministic precedence resolution.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Features](#3-features)
4. [Technology Stack](#4-technology-stack)
5. [Architecture & Design](#5-architecture--design)
6. [Directory Structure](#6-directory-structure)
7. [Prerequisites](#7-prerequisites)
8. [Installation & Setup](#8-installation--setup)
9. [Environment Configuration](#9-environment-configuration)
10. [SQLite Database & Seed Data](#10-sqlite-database--seed-data)
11. [Auth0 Configuration & Identity Mapping](#11-auth0-configuration--identity-mapping)
12. [Running the Application](#12-running-the-application)
13. [API Specification](#13-api-specification)
    - [POST /authorize](#post-authorize)
    - [GET /health](#get-health)
14. [Permission Matching & Wildcard Semantics](#14-permission-matching--wildcard-semantics)
15. [Deterministic Precedence & Conflict Resolution Policy](#15-deterministic-precedence--conflict-resolution-policy)
16. [Error Handling & Security Architecture](#16-error-handling--security-architecture)
17. [Testing Strategy](#17-testing-strategy)
18. [Example cURL Commands](#18-example-curl-commands)
19. [Security Considerations](#19-security-considerations)
20. [Known Limitations & Future Improvements](#20-known-limitations--future-improvements)

---

## 1. Project Overview

In distributed architectures, API gateways and backend services must evaluate incoming requests to ensure that authenticated principals possess the necessary rights to perform actions on specific business resources.

This service acts as a centralized Policy Decision Point (PDP). It decouples authentication from business services:
- **Authentication**: Verifies cryptographically signed OAuth2 JWTs using remote JWKS (JSON Web Key Sets) with standard asymmetric algorithms (`RS256`, `ES256`).
- **Authorization**: Maps incoming HTTP requests to domain actions, normalizes resource paths, evaluates exact and segment wildcard rules, and deterministically resolves conflicting permissions.

---

## 2. Problem Statement

Many authorization mechanisms suffer from:
1. **Ambiguous precedence**: Unclear resolution when a user has both a broad `allow` rule and a specific `deny` rule (or vice versa).
2. **Path traversal and wildcard leakage**: Fragile substring matching that allows `wallets/wallet-789` to inadvertently match `wallets/wallet-7899` or allow directory traversal via `../`.
3. **Coupled identity schemes**: Inflexibility between provider subjects (`auth0|user123`) and application internal user records (`user123`).
4. **Poor error isolation**: Leaking internal exceptions, stack traces, or raw token data to untrusted clients.

This project delivers a robust, secure, and fully tested reference implementation addressing each of these challenges.

---

## 3. Features

* **Cryptographic JWT Validation**: Uses `jose` to verify signatures via Auth0's JWKS endpoint, checking expiration, issuer (`iss`), audience (`aud`), and signature.
* **Flexible Identity Extraction**: Normalizes provider-prefixed subjects (e.g., `auth0|user123` -> `user123`) and supports custom user claim overrides.
* **Hierarchical Permission Modeling**: Stores resource-level permissions in SQLite using parameterized queries.
* **Safe Resource Path Normalization**: Strips query strings and URL fragments, canonicalizes repeated slashes, safely decodes percent-encoded segments, and prevents path traversal attacks.
* **Deterministic Precedence Engine**:
  * More specific patterns override general patterns.
  * At the same specificity level, **DENY beats ALLOW**.
  * Default-deny posture when no matching rules exist.
* **Production-Grade Observability**: Structured JSON logging with Pino, automatically redacting access tokens, authorization headers, and secrets.
* **Comprehensive Test Suite**: Unit and integration tests with **94%+ statement coverage** using Vitest and Supertest without requiring external network dependencies.

---

## 4. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Language** | TypeScript (v6 / NodeNext) | Static typing, maintainability, and compile-time safety |
| **Runtime** | Node.js (v20+) | High-throughput asynchronous JavaScript runtime |
| **Framework** | Express.js (v5) | HTTP server, routing, and middleware pipeline |
| **Database** | SQLite via `better-sqlite3` | Zero-latency embedded database with WAL mode |
| **JWT & Crypto** | `jose` (v6) | Asymmetric token verification against remote JWKS |
| **Validation** | `Zod` (v4) | Strict schema validation for HTTP payloads |
| **Logging** | `Pino` & `pino-pretty` | Low-overhead structured JSON logging with token redaction |
| **Testing** | `Vitest` & `Supertest` | Unit and integration testing, V8 code coverage |
| **Code Quality** | ESLint & Prettier | Automated code linting and style enforcement |

---

## 5. Architecture & Design

The application follows a clean layered architecture with clear separation of concerns:

```
                  ┌───────────────────────────────┐
                  │    HTTP Client / API Gateway   │
                  └───────────────┬───────────────┘
                                  │ POST /authorize
                                  ▼
                  ┌───────────────────────────────┐
                  │    Express Middleware Stack   │
                  │ (JSON Parser, Error Handler)  │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │      AuthorizeController      │
                  └───────┬───────────────┬───────┘
                          │               │
        1. Validate Token │               │ 2. Authorize Request
                          ▼               ▼
            ┌───────────────────┐   ┌───────────────────────────┐
            │   TokenService    │   │   AuthorizationService    │
            │  (jose + JWKS)    │   └─────────────┬─────────────┘
            └───────────────────┘                 │
                                                  │ 3. Fetch Permissions
                                                  ▼
                                    ┌───────────────────────────┐
                                    │   PermissionRepository    │
                                    │    (better-sqlite3)       │
                                    └─────────────┬─────────────┘
                                                  │
                                                  ▼
                                    ┌───────────────────────────┐
                                    │   SQLite: permissions.db  │
                                    └───────────────────────────┘
```

### Module Responsibilities

1. **`src/schemas/authorize.schema.ts`**: Validates request body structure using Zod; rejects unexpected keys, empty strings, and null bytes.
2. **`src/services/token.service.ts`**: Verifies JWT cryptographic signature, expiration, issuer, and audience; maps claims to an internal `user_id`.
3. **`src/utils/resource-path.ts`**: Maps HTTP verbs (`GET` -> `read`, `POST`/`PUT`/`PATCH` -> `write`, `DELETE` -> `delete`) and canonicalizes resource paths.
4. **`src/utils/permission-matcher.ts`**: Implements segment-based wildcard matching and deterministic specificity calculation.
5. **`src/services/authorization.service.ts`**: Coordinates permissions retrieval, filtering, and conflict resolution according to the documented precedence rules.
6. **`src/repositories/permission.repository.ts`**: Executes parameterized SQL queries against SQLite.
7. **`src/middleware/error-handler.ts`**: Centralized error translation ensuring uniform client errors without leaking stack traces or sensitive data.

---

## 6. Directory Structure

```
├── database/
│   └── init.sql                 # Database table schema and sample seed records
├── src/
│   ├── app.ts                   # Express application setup and middleware configuration
│   ├── server.ts                # HTTP server bootstrap and graceful shutdown handler
│   ├── config/
│   │   ├── env.ts               # Environment variable loading with Zod validation
│   │   └── database.ts          # SQLite connection manager and schema bootstrap
│   ├── controllers/
│   │   └── authorize.controller.ts # Controller for POST /authorize
│   ├── middleware/
│   │   └── error-handler.ts     # Global error and 404 response handlers
│   ├── repositories/
│   │   └── permission.repository.ts # Data access layer with parameterized queries
│   ├── routes/
│   │   ├── authorize.routes.ts  # Route definitions for /authorize
│   │   └── health.routes.ts     # Health check endpoint (/health)
│   ├── schemas/
│   │   └── authorize.schema.ts  # Zod validation schema for requests
│   ├── scripts/
│   │   └── init-db.ts           # Standalone database initialization script
│   ├── services/
│   │   ├── authorization.service.ts # Core PDP resolution engine
│   │   └── token.service.ts     # OAuth2 JWT verification and identity extraction
│   ├── types/
│   │   └── authorization.types.ts # TypeScript interfaces and type definitions
│   └── utils/
│       ├── logger.ts            # Pino logging setup with redaction
│       ├── permission-matcher.ts # Wildcard matching and specificity scoring
│       └── resource-path.ts     # Path normalization and HTTP verb mapping
├── tests/
│   ├── unit/
│   │   ├── authorization.service.test.ts # PDP precedence & resolution tests
│   │   ├── permission-matcher.test.ts    # Wildcard and specificity unit tests
│   │   ├── resource-path.test.ts         # Path normalization & method mapping tests
│   │   └── token.service.test.ts         # RSA JWT verification unit tests
│   └── integration/
│       └── authorize-api.test.ts         # End-to-end API integration tests
├── .env.example                 # Template for local environment configuration
├── .gitignore                   # Git exclusion rules
├── eslint.config.mjs            # ESLint 9/10 flat configuration
├── package.json                 # Node.js dependencies and scripts
├── tsconfig.json                # TypeScript compiler configuration (NodeNext)
└── vitest.config.mjs            # Vitest configuration for unit & integration tests
```

---

## 7. Prerequisites

* **Node.js**: `v20.0.0` or higher (tested on Node.js `v24.x`).
* **npm**: `v10.x` or higher.
* **Git**: Installed and configured.

---

## 8. Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd openfabric
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```

4. **Initialize the SQLite Database:**
   ```bash
   npm run db:init
   ```

---

## 9. Environment Configuration

All environment variables are validated at startup in [src/config/env.ts](file:///d:/projects/openFabric/src/config/env.ts):

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Number | `8080` | Port on which the HTTP server listens |
| `NODE_ENV` | String | `development` | Environment mode (`development`, `test`, `production`) |
| `DATABASE_PATH` | String | `./database/permissions.db` | File path for SQLite database (or `:memory:`) |
| `AUTH0_ISSUER_URL` | String | `https://dev-example.us.auth0.com/` | The base URL of the Auth0 tenant |
| `AUTH0_AUDIENCE` | String | `https://api.openfabric.example.com` | Expected JWT `aud` claim identifier |
| `LOG_LEVEL` | String | `info` | Logging verbosity (`error`, `warn`, `info`, `debug`) |

---

## 10. SQLite Database & Seed Data

The database schema is defined in [database/init.sql](file:///d:/projects/openFabric/database/init.sql):

```sql
CREATE TABLE IF NOT EXISTS user_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny'))
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_action
ON user_permissions(user_id, action);
```

### Seed Records

The following sample records are automatically inserted if not present:

| ID | User ID | Action | Resource | Effect |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `user123` | `read` | `transactions` | `allow` |
| 2 | `user123` | `write` | `transactions` | `allow` |
| 3 | `user123` | `delete` | `transactions` | `deny` |
| 4 | `user123` | `read` | `accounts` | `allow` |
| 5 | `user456` | `read` | `wallets/*` | `allow` |
| 6 | `user456` | `write` | `wallets/wallet-789` | `allow` |
| 7 | `user456` | `read` | `wallets/wallet-789/transactions` | `allow` |
| 8 | `user789` | `write` | `wallets/*/transactions/*` | `allow` |
| 9 | `admin789` | `read` | `*` | `allow` |
| 10 | `admin789` | `write` | `*` | `allow` |
| 11 | `admin789` | `delete` | `*` | `allow` |

Run `npm run db:init` at any time to re-verify or seed the database.

---

## 11. Auth0 Configuration & Identity Mapping

### Auth0 Setup Instructions

1. Log into the [Auth0 Dashboard](https://manage.auth0.com/).
2. Navigate to **Applications** > **APIs** > **Create API**:
   - **Name**: `OpenFabric Authorization API`
   - **Identifier**: `https://api.openfabric.example.com` (Set as `AUTH0_AUDIENCE` in `.env`)
   - **Signing Algorithm**: `RS256`
3. In your `.env`, set:
   - `AUTH0_ISSUER_URL=https://<your-tenant>.us.auth0.com/`
   - `AUTH0_AUDIENCE=https://api.openfabric.example.com`
4. When client applications request an access token from Auth0, they request an audience matching `AUTH0_AUDIENCE`.

### Identity Mapping Strategy

Auth0 typically issues `sub` claims with provider prefixes (e.g., `auth0|user123`, `google-oauth2|user456`).
The service extracts the internal `user_id` using this deterministic fallback strategy:

1. **Custom Claim**: If present, reads `https://openfabric.com/user_id` or `user_id`.
2. **Provider Suffix Extraction**: If the `sub` claim contains a pipe (`|`), it extracts the identifier after the first pipe (e.g. `auth0|user123` -> `user123`).
3. **Direct Subject**: If no delimiter exists, the `sub` claim is used as-is (e.g. `user123`).

This ensures that real Auth0 tokens integrate seamlessly with existing application database keys.

---

## 12. Running the Application

### Development Mode (with hot-reloading)
```bash
npm run dev
```

### Production Build & Execution
```bash
# Compile TypeScript to dist/
npm run build

# Start production server
npm start
```

---

## 13. API Specification

### POST /authorize

Evaluates whether the authenticated user is allowed or denied access to a requested method and resource.

#### Request Headers
```http
Content-Type: application/json
```

#### Request Body
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "method": "GET",
  "path": "/wallets/wallet-789/transactions"
}
```

#### Response (200 OK - Access Allowed)
```json
{
  "decision": "ALLOW",
  "user_id": "user456",
  "reason": "User has read permission for wallets/wallet-789/transactions",
  "matched_permissions": [
    {
      "action": "read",
      "resource": "wallets/wallet-789/transactions",
      "effect": "allow"
    }
  ]
}
```

#### Response (200 OK - Access Denied)
```json
{
  "decision": "DENY",
  "user_id": "user123",
  "reason": "Explicit deny permission takes precedence at specificity level 10 for resource 'transactions'",
  "matched_permissions": [
    {
      "action": "delete",
      "resource": "transactions",
      "effect": "deny"
    }
  ]
}
```

#### Response (401 Unauthorized - Invalid or Expired Token)
```json
{
  "error": "Unauthorized",
  "message": "Access token has expired",
  "statusCode": 401
}
```

#### Response (400 Bad Request - Validation Error)
```json
{
  "error": "Bad Request",
  "message": "Validation failed for request body",
  "details": [
    {
      "path": "method",
      "message": "Unsupported HTTP method. Allowed methods: 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'"
    }
  ],
  "statusCode": 400
}
```

---

### GET /health

Liveness and health check endpoint for monitoring and container orchestrators.

#### Response (200 OK)
```json
{
  "status": "healthy",
  "uptime": 142.53,
  "timestamp": "2026-10-13T16:15:20.123Z"
}
```

---

## 14. Permission Matching & Wildcard Semantics

Paths and resource patterns are evaluated using **safe segment-based matching**, preventing substring collisions.

### HTTP Method Mapping

| HTTP Verb | Action |
| :--- | :--- |
| `GET` | `read` |
| `POST` | `write` |
| `PUT` | `write` |
| `PATCH` | `write` |
| `DELETE` | `delete` |
| Other verbs (`OPTIONS`, `HEAD`, `TRACE`, etc.) | Rejected with `400 Bad Request` |

### Path Normalization Rules

* Leading and trailing slashes are removed: `/wallets/wallet-1/` -> `wallets/wallet-1`
* Consecutive slashes are collapsed: `wallets///wallet-1` -> `wallets/wallet-1`
* Query strings and hash fragments are stripped: `/wallets/1?page=2#top` -> `wallets/1`
* URL-encoded segments are decoded: `/wallets/wallet%2D1` -> `wallets/wallet-1`
* Path traversal tokens (`..`, `.`) are strictly rejected.

### Wildcard Matching & Hierarchical Inheritance Semantics

1. **Global Resource Wildcard (`*`)**: Matches any resource path regardless of segment count (e.g., `admin789` with `*` matches `transactions`, `wallets/wallet-789`, `accounts/acc-123/settings`, or `a/b/c/d`). Specificity score = `0`.
2. **Segment Wildcard (`*`)**: Matches exactly **one** non-empty path segment at that position within an equal segment count.
   - `wallets/*` matches `wallets/wallet-123` and `wallets/wallet-999` (score: 10 + 1 = 11).
   - `wallets/*` does **not** match `wallets/wallet-123/transactions` (requires matching segment count).
3. **Multi-Segment Wildcard (`wallets/*/transactions/*`)**: Matches any path with 4 segments where segments 0 and 2 match literally and segments 1 and 3 are wildcards (score: 10 + 1 + 10 + 1 = 22).
4. **Wildcard Collection-Write Matching (Scenario 4b)**:
   - When a permission pattern ends in `/*` (e.g., `wallets/*/transactions/*`), it grants access to items inside that collection.
   - In REST APIs, creating an item within a collection is performed by writing to the collection endpoint (`POST /wallets/wallet-789/transactions`).
   - The permission matcher allows patterns ending in `/*` to match requests targeting the immediate parent collection.
   - Unrelated collections (e.g., `/transfers`) or different resource depths do not match.
5. **Hierarchical Parent-to-Child Resource Inheritance (Rule 4)**:
   - Permissions configured on a collection resource automatically apply to member entity items within that collection:
     - `transactions` applies to `transactions/txn-456` and `transactions/txn-123`.
     - `accounts` applies to `accounts/acc-456`.
     - `wallets` applies to `wallets/wallet-789`.
     - `wallets/wallet-789/transactions` applies to `wallets/wallet-789/transactions/txn-456`.
   - **Sub-Collection Isolation Boundary**: A permission on an entity instance (such as `wallets/wallet-789`) grants access to the wallet itself (e.g., wallet settings or properties), but does **not** cross into independent child collections like `transactions`. Transactions within a wallet require transaction-level permissions (`wallets/wallet-789/transactions`, `wallets/*/transactions/*`, or global `*`).
   - **Item Wildcards Do Not Cascade**: Patterns ending in a wildcard segment (e.g., `wallets/*` or `wallets/*/transactions/*`) represent item-level patterns at that specific depth and do not cascade into arbitrary deeper subpaths.
6. **Strict Segment Boundaries**: Substring or prefix matches across segment boundaries (e.g., `wallets/wallet-789` matching `wallets/wallet-7899` or `transactions` matching `transactions-archived`) are strictly forbidden.

---

## 15. Deterministic Precedence & Conflict Resolution Policy

### Chosen Interpretation of Precedence Rules

The assignment specifies two fundamental rules:
1. **More specific resource paths take precedence over general paths.**
2. **Deny beats Allow.**

To eliminate ambiguity, this service implements the following deterministic algorithm:

1. **Retrieve**: Query all permissions for the verified user and the mapped action from SQLite.
2. **Filter**: Identify all permission records matching the requested canonical resource path (including exact matches, wildcard collection matches, and inherited parent collection permissions).
3. **Score Specificity**:
   - Global wildcard (`*`): Specificity = `0`
   - Segmented pattern: Each exact segment contributes `10` points; each wildcard segment (`*`) contributes `1` point.
   - Specificity ranking examples:
     - Target: `transactions/txn-456`
       - `transactions/txn-456` (exact child): Specificity = `20` (10 + 10)
       - `transactions/*` (wildcard child): Specificity = `11` (10 + 1)
       - `transactions` (inherited parent collection): Specificity = `10`
       - `*` (global wildcard): Specificity = `0`
     - Target: `wallets/wallet-789/transactions`
       - `wallets/wallet-789/transactions` (exact collection): Specificity = `30` (10 + 10 + 10)
       - `wallets/*/transactions/*` (collection-write wildcard): Specificity = `22` (10 + 1 + 10 + 1)
       - `*` (global wildcard): Specificity = `0`
4. **Isolate Highest Level**: Filter only the matched permissions that achieve the maximum specificity score.
5. **Conflict Resolution at Highest Specificity**:
   - If any `deny` exists at this highest specificity level, **DENY wins**.
   - If only `allow` exists at this highest specificity level, **ALLOW wins**.
   - If no permissions match at all, **default to DENY**.

### Precedence Matrix

| Scenario | General Rule | Specific Rule | Target Resource | Decision | Rationale |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Child Deny Overrides Parent Allow** | `transactions` (ALLOW) | `transactions/txn-456` (DENY) | `transactions/txn-456` | **DENY** | Child rule (score 20) overrides parent collection rule (score 10). |
| **Child Allow Overrides Parent Deny** | `transactions` (DENY) | `transactions/txn-123` (ALLOW) | `transactions/txn-123` | **ALLOW** | Child rule (score 20) overrides parent collection rule (score 10). |
| **General Allow, Specific Deny** | `*` (ALLOW) | `wallets/secret` (DENY) | `wallets/secret` | **DENY** | Specific DENY (score 20) beats General ALLOW (score 0). |
| **General Deny, Specific Allow** | `wallets/*` (DENY) | `wallets/wallet-vip` (ALLOW) | `wallets/wallet-vip` | **ALLOW** | Specific ALLOW (score 20) beats General DENY (score 11). |
| **Same Specificity Conflict** | `transactions` (ALLOW) | `transactions` (DENY) | `transactions` | **DENY** | Both at score 10: Deny beats Allow. |
| **No Applicable Permission** | None | None | `any/resource` | **DENY** | Default Deny posture. |

---

## 16. Error Handling & Security Architecture

### Strongly Typed Application Errors
The service replaces fragile string matching with a formal typed error hierarchy (`src/errors/app-error.ts`):
* `BadRequestError` (400): Malformed bodies, invalid JSON, unsupported HTTP methods, and directory traversal attempts.
* `AuthenticationError` (401 / 500): Invalid signatures, expired tokens, forged tokens, missing `sub` claims, or unconfigured Auth0 environment.
* `UpstreamServiceError` (502 / 503): Network timeouts, DNS resolution failures, or connection errors connecting to the trusted JWKS endpoint.

### Upstream JWKS Error Handling
* Network timeouts (`ERR_JWKS_TIMEOUT`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, fetch aborts) are accurately categorized as `503 Service Unavailable` or `502 Bad Gateway`.
* Unrecognized token keys (`ERR_JWKS_NO_MATCHING_KEY`) or invalid signatures are treated as client token verification failures (`401 Unauthorized`).
* Internal network topology, socket addresses, and provider URLs are never exposed in error responses.

### Sanitized 500 Internal Server Errors
Unexpected server errors (e.g., unexpected SQLite errors) are caught by the central Express error handler, logged via Pino with full error context, and returned to clients as:
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected internal error occurred",
  "statusCode": 500
}
```

---

## 17. Testing Strategy

The test suite runs with Vitest and Supertest. It requires **no external Auth0 accounts or live network calls**. Tests cryptographically sign and verify real `RS256` JWTs using an in-memory key pair.

### Test Execution Commands

```bash
# Run the complete test suite (Unit + Integration)
npm test

# Run tests in watch mode
npm run test:watch

# Run tests and generate code coverage report
npm run test:coverage

# Run TypeScript compilation check
npm run build

# Run linter
npm run lint

# Check code formatting
npm run format
```

### Test Coverage Highlights

* **94.21%** overall statement coverage across all application modules.
* **100%** coverage across Express routes, controllers, error handlers, and permission repositories.
* **90 automated test cases** across 6 test suites:
  - `tests/unit/permission-matcher.test.ts` (17 tests): Exact matching, wildcard collection writes, hierarchical parent-to-child inheritance, boundary isolation, and specificity scoring.
  - `tests/unit/authorization.service.test.ts` (19 tests): All assignment sample scenarios, precedence resolution, explicit denial inheritance, and equal-specificity conflicts.
  - `tests/unit/token.service.test.ts` (14 tests): Valid tokens, Auth0 prefix normalization, custom claims, expired tokens, forged signatures, invalid issuer/audience, missing identity, upstream JWKS timeouts (503), network failures (503), and missing configuration (500).
  - `tests/unit/resource-path.test.ts` (13 tests): Method mapping, path normalization, trailing slashes, URL decode safety, traversal blocking, and null byte rejection.
  - `tests/unit/permission.repository.test.ts` (5 tests): Parameterized queries, action filtering, insert operations, and database error recovery.
  - `tests/integration/authorize-api.test.ts` (22 tests): End-to-end HTTP API integration verifying all assignment scenarios, health checks, 401 client errors, 503 upstream errors, 400 validation errors, and sanitized 500 responses.

---

## 18. Assignment Sample Scenarios & Verification

All scenarios from the assignment specification (Pages 5–7) are verified with exact HTTP methods, resource paths, and expected decisions:

### Scenario 1: user123 Read Transactions (ALLOW)
```bash
curl -i -X POST http://localhost:8080/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "valid_token_for_user123",
    "method": "GET",
    "path": "/transactions"
  }'
```
**Expected Response (200 OK):**
```json
{
  "decision": "ALLOW",
  "user_id": "user123",
  "reason": "User has read permission for transactions",
  "matched_permissions": [
    {
      "action": "read",
      "resource": "transactions",
      "effect": "allow"
    }
  ]
}
```

### Scenario 2: user123 Explicit Deny on Nested Resource (DENY)
```bash
curl -i -X POST http://localhost:8080/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "valid_token_for_user123",
    "method": "DELETE",
    "path": "/transactions/txn-456"
  }'
```
**Expected Response (200 OK):**
```json
{
  "decision": "DENY",
  "user_id": "user123",
  "reason": "Explicit deny permission takes precedence at specificity level 10 for resource 'transactions/txn-456'",
  "matched_permissions": [
    {
      "action": "delete",
      "resource": "transactions",
      "effect": "deny"
    }
  ]
}
```

### Scenario 2b: user123 Inherited Read on Nested Resource (ALLOW)
```bash
curl -i -X POST http://localhost:8080/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "valid_token_for_user123",
    "method": "GET",
    "path": "/transactions/txn-123"
  }'
```
**Expected Response (200 OK):**
```json
{
  "decision": "ALLOW",
  "user_id": "user123",
  "reason": "User has read permission for transactions/txn-123",
  "matched_permissions": [
    {
      "action": "read",
      "resource": "transactions",
      "effect": "allow"
    }
  ]
}
```

### Scenario 3: user456 Specific Permission on Wallet Transactions (ALLOW)
```bash
curl -i -X POST http://localhost:8080/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "valid_token_for_user456",
    "method": "GET",
    "path": "/wallets/wallet-789/transactions"
  }'
```
**Expected Response (200 OK):**
```json
{
  "decision": "ALLOW",
  "user_id": "user456",
  "reason": "User has read permission for wallets/wallet-789/transactions",
  "matched_permissions": [
    {
      "action": "read",
      "resource": "wallets/wallet-789/transactions",
      "effect": "allow"
    }
  ]
}
```

### Scenario 4a: user789 Write to Any Transaction Item (ALLOW)
```bash
curl -i -X POST http://localhost:8080/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "valid_token_for_user789",
    "method": "POST",
    "path": "/wallets/wallet-456/transactions/txn-999"
  }'
```
**Expected Response (200 OK):**
```json
{
  "decision": "ALLOW",
  "user_id": "user789",
  "reason": "User has write permission for wallets/wallet-456/transactions/txn-999",
  "matched_permissions": [
    {
      "action": "write",
      "resource": "wallets/*/transactions/*",
      "effect": "allow"
    }
  ]
}
```

### Scenario 4b: user789 Write to Transaction Collection (ALLOW)
```bash
curl -i -X POST http://localhost:8080/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "valid_token_for_user789",
    "method": "POST",
    "path": "/wallets/wallet-789/transactions"
  }'
```
**Expected Response (200 OK):**
```json
{
  "decision": "ALLOW",
  "user_id": "user789",
  "reason": "User has write permission for wallets/wallet-789/transactions",
  "matched_permissions": [
    {
      "action": "write",
      "resource": "wallets/*/transactions/*",
      "effect": "allow"
    }
  ]
}
```

### Scenario 5: user456 Write to Wallet Transactions (DENY)
```bash
curl -i -X POST http://localhost:8080/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "valid_token_for_user456",
    "method": "POST",
    "path": "/wallets/wallet-789/transactions"
  }'
```
**Expected Response (200 OK):**
```json
{
  "decision": "DENY",
  "user_id": "user456",
  "reason": "No matching permissions found for resource 'wallets/wallet-789/transactions'",
  "matched_permissions": []
}
```

### Scenario 6: admin789 Global Wildcard Access (ALLOW)
```bash
curl -i -X POST http://localhost:8080/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "valid_token_for_admin789",
    "method": "DELETE",
    "path": "/accounts/acc-123/settings"
  }'
```
**Expected Response (200 OK):**
```json
{
  "decision": "ALLOW",
  "user_id": "admin789",
  "reason": "User has delete permission for accounts/acc-123/settings",
  "matched_permissions": [
    {
      "action": "delete",
      "resource": "*",
      "effect": "allow"
    }
  ]
}
```

### Scenario 7: user456 Wildcard Inheritance on Wallet (ALLOW)
```bash
curl -i -X POST http://localhost:8080/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "valid_token_for_user456",
    "method": "GET",
    "path": "/wallets/wallet-999"
  }'
```
**Expected Response (200 OK):**
```json
{
  "decision": "ALLOW",
  "user_id": "user456",
  "reason": "User has read permission for wallets/wallet-999",
  "matched_permissions": [
    {
      "action": "read",
      "resource": "wallets/*",
      "effect": "allow"
    }
  ]
}
```

---

## 19. Security Considerations

1. **Cryptographic Integrity**: Tokens are verified using Auth0's published JWKS. Algorithms are restricted to asymmetric public-key cryptosystems (`RS256`, `ES256`). Symmetric algorithms (`HS256`) and the insecure `none` algorithm are rejected.
2. **Input Sanitization**: Request bodies are strictly validated with Zod, rejecting unexpected fields to avoid parameter injection.
3. **Path Traversal Protection**: Any path containing `..` or null-byte characters is rejected before permission matching occurs.
4. **Least Privilege**: The service operates in a default-deny mode. If an action or resource is not explicitly permitted, access is denied.

---

## 20. Known Limitations & Video Demo Script

### Known Limitations
* **JWKS Caching & Invalidation**: Currently relies on `jose.createRemoteJWKSet`, which provides in-memory key caching. In distributed multi-region deployments, an external Redis cache could be added.
* **Role-Based Access Control (RBAC)**: The current database directly maps permissions to `user_id`. A natural next step is adding a `roles` and `role_permissions` table to support groups and roles.
* **Rate Limiting**: Can integrate `express-rate-limit` to throttle unauthenticated brute-force requests on `/authorize`.

### Recommended 2–3 Minute Video Demo Recording Script
To satisfy the take-home submission guideline (*"3. Provide a brief video demo (2-3 minutes) of your working solution"*):

1. **Introduction (0:00 – 0:30)**:
   - Introduce the service architecture: TypeScript, Express, SQLite (`better-sqlite3`), and `jose` for OAuth2 JWT verification.
   - Mention the two core endpoints: `GET /health` and `POST /authorize`.
2. **Database & Precedence Model (0:30 – 1:00)**:
   - Show `database/init.sql` and the 11 seed permissions.
   - Explain the deterministic precedence rules: specific rules beat general rules, deny beats allow at equal specificity, and collection writes (`wallets/*/transactions/*`) match `POST /wallets/wallet-789/transactions`.
3. **Running the Live Tests (1:00 – 1:45)**:
   - Run `npm test` and `npm run test:coverage` in the terminal to demonstrate that all 90 tests pass across 6 suites with >94% coverage.
4. **Interactive cURL Walkthrough (1:45 – 2:30)**:
   - Start the service (`npm run dev`).
   - Execute Scenario 1 (`GET /transactions` -> ALLOW).
   - Execute Scenario 2 (`DELETE /transactions/txn-456` -> explicit DENY).
   - Execute Scenario 4b (`POST /wallets/wallet-789/transactions` -> ALLOW).
   - Execute Scenario 5 (`POST /wallets/wallet-789/transactions` for user456 -> DENY).
5. **Conclusion (2:30 – 2:45)**:
   - Highlight error handling (400 validation, 401 unauthorized, 503 upstream JWKS timeout, sanitized 500s).

