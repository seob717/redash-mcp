import { describe, it, expect } from "vitest";
import { nextWidgetPosition } from "../src/dashboard-layout.js";

describe("nextWidgetPosition", () => {
  it("starts at the top-left of an empty dashboard", () => {
    expect(nextWidgetPosition([], 2)).toEqual({ col: 0, row: 0, sizeX: 12, sizeY: 8 });
  });

  it("places a half-width widget beside a lone half-width widget on the last row", () => {
    const existing = [{ col: 0, row: 0, sizeX: 12, sizeY: 8 }, { col: 0, row: 8, sizeX: 6, sizeY: 14 }];
    expect(nextWidgetPosition(existing, 1)).toEqual({ col: 6, row: 8, sizeX: 6, sizeY: 14 });
  });

  it("starts a new row when the last row is full", () => {
    const existing = [{ col: 0, row: 0, sizeX: 6, sizeY: 14 }, { col: 6, row: 0, sizeX: 6, sizeY: 14 }];
    expect(nextWidgetPosition(existing, 1)).toEqual({ col: 0, row: 14, sizeX: 6, sizeY: 8 });
  });

  it("ignores widgets without a stored position", () => {
    expect(nextWidgetPosition([{}, {}], 1)).toEqual({ col: 0, row: 0, sizeX: 6, sizeY: 8 });
  });
});
