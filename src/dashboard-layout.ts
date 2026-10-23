// Redash 25 dashboards use a 12-column grid.
const GRID_COLUMNS = 12;
const DEFAULT_SIZE_Y = 8;

export interface WidgetPosition {
  col: number;
  row: number;
  sizeX: number;
  sizeY: number;
}

/**
 * Places a new widget below the existing ones; a half-width widget fills the empty
 * right half of the last row. Without a position Redash stacks every widget at 0,0.
 */
export function nextWidgetPosition(existing: Partial<WidgetPosition>[], width: 1 | 2): WidgetPosition {
  const sizeX = width === 2 ? GRID_COLUMNS : GRID_COLUMNS / 2;
  const placed = existing.filter(
    (p): p is WidgetPosition => [p.col, p.row, p.sizeX, p.sizeY].every((n) => typeof n === "number"),
  );
  const bottom = Math.max(0, ...placed.map((p) => p.row + p.sizeY));

  if (sizeX < GRID_COLUMNS) {
    const lastRow = placed.filter((p) => p.row + p.sizeY === bottom);
    if (lastRow.length === 1 && lastRow[0].col === 0 && lastRow[0].sizeX <= GRID_COLUMNS - sizeX) {
      return { col: GRID_COLUMNS - sizeX, row: lastRow[0].row, sizeX, sizeY: lastRow[0].sizeY };
    }
  }
  return { col: 0, row: bottom, sizeX, sizeY: DEFAULT_SIZE_Y };
}
