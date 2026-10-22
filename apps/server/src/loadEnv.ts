/**
 * Side-effect module: index.ts imports it first so the env file is in process.env before
 * config.ts reads and validates it. See envFile.ts. Skipped under Vitest so a developer's own
 * .env never leaks into test runs; tests call loadEnvFile directly.
 */
import { loadEnvFile } from "./envFile.js";

if (!process.env.VITEST) loadEnvFile();
