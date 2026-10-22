/**
 * Vitest setup file (see vitest.config.ts). The server reads and validates its configuration
 * once at import time, so safe defaults must exist before any test module imports src/.
 * Individual tests override values through bootApp(env), which reloads the config.
 */
process.env.DATABASE_URL ??= ":memory:";
process.env.JWT_SECRET ??= "test-secret-not-for-production";
process.env.NODE_ENV ??= "test";
// Tests register many users per file; keep the auth rate limit out of the way unless a test opts in.
process.env.TEAMFLOW_AUTH_RATE_LIMIT ??= "1000";
