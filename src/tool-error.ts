/**
 * Shared error handler for MCP tool callbacks.
 * Logs the full error to stderr for debugging, then returns a
 * user-friendly MCP error response without leaking internal details.
 */
export function handleToolError(toolName: string, error: unknown) {
  const detail =
    error instanceof Error ? error.message : String(error);

  // Log full detail to stderr so operators can debug.
  console.error(`[${toolName}] ${detail}`);

  // Derive a safe, user-facing message.
  let userMessage: string;
  if (detail.includes("Query timed out")) {
    userMessage = "The query timed out. Try simplifying the query or increasing timeout_secs.";
  } else if (detail.includes("Query failed")) {
    userMessage = "The query execution failed. Please check the SQL syntax and try again.";
  } else if (detail.includes("401") || detail.includes("Check your REDASH_API_KEY")) {
    userMessage = "Authentication failed. Please verify your Redash API key.";
  } else if (detail.includes("403") || detail.includes("Access denied")) {
    userMessage = "Access denied. You do not have permission for this resource.";
  } else if (/\b404\b/.test(detail) || detail.includes("Redash API error (404)")) {
    userMessage = "The requested resource was not found. Please check the ID and try again.";
  } else if (detail.includes("Redash API error")) {
    userMessage = "The Redash API returned an error. Please try again later.";
  } else if (detail.includes("fetch failed") || detail.includes("ECONNREFUSED") || detail.includes("ENOTFOUND")) {
    userMessage = "Unable to connect to the Redash server. Please check REDASH_URL and network connectivity.";
  } else {
    userMessage = "An unexpected error occurred. Please try again or check the server logs.";
  }

  return {
    content: [{ type: "text" as const, text: userMessage }],
    isError: true,
  };
}
