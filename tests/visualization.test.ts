import { describe, it, expect } from "vitest";
import { buildVisualization } from "../src/visualization.js";

describe("buildVisualization", () => {
  it("maps x, y, and series columns for charts", () => {
    const v = buildVisualization({ type: "line", x_column: "date", y_columns: ["total", "failed"], series_column: "model", stacked: true });
    expect(v.type).toBe("CHART");
    expect(v.options).toMatchObject({
      globalSeriesType: "line",
      columnMapping: { date: "x", total: "y", failed: "y", model: "series" },
      series: { stacking: "stack" },
    });
  });

  it("builds a counter from the first y column", () => {
    expect(buildVisualization({ type: "counter", y_columns: ["revenue"] })).toEqual({
      type: "COUNTER",
      options: { counterColName: "revenue", rowNumber: 1 },
    });
  });

  it("requires an x column for charts", () => {
    expect(() => buildVisualization({ type: "pie", y_columns: ["n"] })).toThrow(/x_column/);
  });
});
