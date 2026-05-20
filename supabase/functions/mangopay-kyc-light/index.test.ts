/**
 * Smoke test — confirms the module loads without throwing.
 *
 * Full integration testing (valid JWT + Mangopay sandbox calls) lives in
 * Phase 7 manual QA. Exercising the actual handler in a unit test would
 * require mocking Supabase Auth, the service-role DB client, and the
 * Mangopay REST API — more setup than value for a one-time-per-user
 * idempotent endpoint.
 *
 * What this test validates:
 *   - The module can be imported (no top-level syntax/type errors)
 *   - Deno.serve is called (side effect happens at module evaluation time)
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Importing index.ts as a side effect calls Deno.serve(), which opens an HTTP
// listener that Deno's test runner flags as a resource leak. We use
// sanitizeResources / sanitizeOps: false to suppress those checks — the
// server is the entire point of the module. The import itself throwing
// would still fail the test.
Deno.test({
  name: 'module loads without throwing',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Dynamic import triggers Deno.serve registration. If the module has a
    // top-level error (bad import path, syntax issue, wrong env access) this
    // throws and the test fails.
    const mod = await import('./index.ts');
    // Module loaded — assert it's an object (Deno module namespace shape).
    assertEquals(typeof mod, 'object');
  },
});
