/** Thrown when the app needs a database update (a migration file) that hasn't been run yet. */
export class DatabaseUpdateNeeded extends Error {
  constructor(public detail: string) {
    super("DATABASE_UPDATE_NEEDED");
  }
}

/** PostgREST answers "function not found" (PGRST202) or "relation/column does not exist" (42P01/42703). */
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    ["PGRST202", "PGRST205", "42P01", "42703", "42883"].includes(error.code ?? "") ||
    /could not find the (function|table)|does not exist/i.test(error.message ?? "")
  );
}

export function dbError(context: string, error: { code?: string; message: string }) {
  return isMissingSchema(error) ? new DatabaseUpdateNeeded(error.message) : new Error(`${context}: ${error.message}`);
}
