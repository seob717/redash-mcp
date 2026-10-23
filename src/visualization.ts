export const CHART_TYPES = ["line", "column", "area", "pie", "scatter", "counter"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface VisualizationSpec {
  type: ChartType;
  x_column?: string;
  y_columns: string[];
  series_column?: string;
  stacked?: boolean;
  horizontal?: boolean;
}

/**
 * Builds the Redash visualization `type` and `options` payload. CHART options mirror
 * what the Redash 25 editor saves, so the chart opens cleanly in the UI editor.
 */
export function buildVisualization(spec: VisualizationSpec): { type: string; options: Record<string, unknown> } {
  if (spec.y_columns.length === 0) throw new Error("y_columns must list at least one column");

  if (spec.type === "counter") {
    return { type: "COUNTER", options: { counterColName: spec.y_columns[0], rowNumber: 1 } };
  }

  if (!spec.x_column) throw new Error(`x_column is required for ${spec.type} charts`);
  const columnMapping: Record<string, string> = { [spec.x_column]: "x" };
  for (const y of spec.y_columns) columnMapping[y] = "y";
  if (spec.series_column) columnMapping[spec.series_column] = "series";

  return {
    type: "CHART",
    options: {
      globalSeriesType: spec.type,
      columnMapping,
      sortX: true,
      swappedAxes: spec.horizontal ?? false,
      xAxis: { type: "-", labels: { enabled: true } },
      yAxis: [{ type: "linear" }, { type: "linear", opposite: true }],
      legend: { enabled: true, placement: "auto", traceorder: "normal" },
      series: { stacking: spec.stacked ? "stack" : null, error_y: { type: "data", visible: true } },
      seriesOptions: {},
      valuesOptions: {},
      showDataLabels: spec.type === "pie",
      numberFormat: "0,0[.]00",
      percentFormat: "0[.]00%",
      dateTimeFormat: "YYYY-MM-DD HH:mm",
      missingValuesAsZero: true,
    },
  };
}
