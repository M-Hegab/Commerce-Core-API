# AGENTS.md

## Project
Express 5 + TypeScript API using PostgreSQL (hosted on Neon). ESM (`"type": "module"`).
Uses Drizzle ORM with the `postgres` (postgres-js) driver.

## Commands
| Task | Command |
|---|---|
| Dev server | `npm run dev` (`tsx watch src/server.ts`) |
| Build | `npm run build` (`tsc --rootDir src --outDir dist`) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) |
| Lint | `npm run lint` (`eslint .`) |
| Test (one-shot) | `npm run test` (`vitest run`) |
| Test (watch) | `npm run test:watch` (`vitest watch`) |
| Start (built) | `npm start` (`node dist/server.js`) |

**Order when validating:** `npm run typecheck` → `npm run lint` → `npm run test`.

## Architecture
```
src/server.ts     → entry point; loads env, starts HTTP server
src/app.ts        → creates Express app, adds middleware, registers routers
src/routes/*.ts   → route handlers using express.Router(), export default router
src/db/index.ts   → Drizzle DB instance (checks DATABASE_URL at module load)
src/db/schema.ts  → Drizzle ORM schema (pgTable definitions)
src/db/SQL/*.sql  → raw SQL schema files (manual DB setup reference)
```

## ESM imports
`tsconfig.json` uses `"module": "nodenext"` and `moduleDetection: "force"`. All relative imports must include the `.js` extension even in `.ts` files (e.g., `import app from "../app.js"`).

## .env loading order (critical)
`dotenv.config()` must execute **before** any module that reads `process.env` at import time. The DB module (`src/db/index.ts`) checks `process.env.DATABASE_URL` at module load. Since ESM static imports are hoisted, you cannot call `dotenv.config()` in the module body before a static import. Use a **dynamic import** after `config()`:

```ts
import * as dotenv from 'dotenv';
dotenv.config();
const { default: app } = await import('./app.js');
```

## TypeScript strictness
`tsconfig.json` enables: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedSideEffectImports`.
- With `verbatimModuleSyntax`, type-only imports must use `import type { ... }`.
- With `noUncheckedIndexedAccess`, array access returns `T | undefined`.

## Schema source of truth
The SQL schema is in `src/db/SQL/schema.sql` (the file was previously misspelled `scemal.sql`). The Drizzle ORM schema in `src/db/schema.ts` must match the SQL schema. Both define `name VARCHAR(255) NOT NULL`. Keep them in sync.

## Authentication
Passwords are hashed with `bcrypt` (10 salt rounds). Never store or return plaintext passwords. Password hash must never appear in API responses.

## Route registration
`src/app.ts` creates the Express app and registers routers:
```ts
app.use(express.json());
app.use(usersRouter);
```
Routes are defined using `express.Router()` in `src/routes/*.ts` and imported into `app.ts`. The JSON body parser middleware must be registered **before** the routers.

## PostgreSQL error handling
The `postgres` driver propagates PostgreSQL SQLSTATE error codes on thrown errors. Key code: `23505` (unique_violation). Catch these and translate to appropriate HTTP status codes (e.g., `409 Conflict` for duplicate email). The raw error must never reach the client — log it server-side and return a generic message.

## Testing
- Vitest is installed; no `vitest.config` file exists (uses defaults: Node environment).
- Tests are co-located as `*.test.ts` files in `src/`.
- To run a single test file: `npx vitest run path/to/file.test.ts`.
- Mock `vi.mock('../db/index.js', ...)` for DB access; use `vi.spyOn(bcrypt, 'hash')` to avoid slow real hashing.
- Endpoint tests use `http.createServer(app)` + native `fetch` (no extra test HTTP library needed).

## Gotchas
- `.env` is in `.gitignore` but present locally; never commit it. Create `.env.example` for new env vars.
- `package.json` `homepage` and `repository` URLs may point to a stale repo — verify before publishing.
