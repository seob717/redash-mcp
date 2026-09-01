import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleToolError } from "../src/tool-error.js";
import { RedashApiError } from "../src/redash-client.js";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("handleToolError", () => {
  it("maps a 401 API error to an authentication message", () => {
    const r = handleToolError("t", new RedashApiError(401, "Unauthorized"));
    expect(r.content[0].text).toMatch(/authentication/i);
  });

  it("maps a 404 API error to a not-found message", () => {
    const r = handleToolError("t", new RedashApiError(404, "Not Found"));
    expect(r.content[0].text).toMatch(/not found/i);
  });

  it("does not misread digits in unrelated errors as HTTP statuses", () => {
    const r = handleToolError("t", new Error('column "x_401" does not exist'));
    expect(r.content[0].text).not.toMatch(/authentication/i);
  });

  it("flags the result as an error", () => {
    const r = handleToolError("t", new Error("boom"));
    expect(r.isError).toBe(true);
  });
});
