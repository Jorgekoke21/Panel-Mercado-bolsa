export type ViewErrorKind = "data" | "configuration" | "render";

/** Production Server Component errors are intentionally sanitized by Next.js. */
export function classifyViewError(error: Pick<Error, "name" | "message">): ViewErrorKind {
  if (error.name === "ConfigurationError" || error.message.startsWith("Invalid server environment:")) return "configuration";
  if (error.name === "DataAccessError" || error.message.startsWith("Database query failed (")) return "data";
  return "render";
}
