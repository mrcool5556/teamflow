import { createDb, type Db } from "@teamflow/db";
import { config } from "./config.js";

/** The process-wide database handle, opened once from the validated config. */
export const db: Db = createDb(config.databaseUrl);
