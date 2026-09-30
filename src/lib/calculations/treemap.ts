/**
 * Treemap "squarified" (Bruls, Huizing & van Wijk, 2000) implementado como función pura.
 *
 * Trabaja en un lienzo abstracto (p. ej. 1000×600); el componente convierte a porcentajes,
 * así el cálculo se hace una vez en servidor y el render es responsive.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreemapItem<T> {
  id: string;
  value: number;
  data: T;
}

export interface TreemapCell<T> extends Rect {
  id: string;
  value: number;
  data: T;
}

function worstRatio(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  const side2 = side * side;
  const sum2 = sum * sum;
  return Math.max((side2 * max) / sum2, sum2 / (side2 * min));
}

export function squarify<T>(items: readonly TreemapItem<T>[], rect: Rect): TreemapCell<T>[] {
  const valid = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const total = valid.reduce((sum, item) => sum + item.value, 0);
  if (valid.length === 0 || total <= 0 || rect.width <= 0 || rect.height <= 0) return [];

  const scale = (rect.width * rect.height) / total;
  const areas = valid.map((item) => item.value * scale);
  const cells: TreemapCell<T>[] = [];
  let free: Rect = { ...rect };
  let row: number[] = [];
  let rowStart = 0;

  const layoutRow = () => {
    const sum = row.reduce((a, b) => a + b, 0);
    if (free.width >= free.height) {
      const rowWidth = sum / free.height;
      let y = free.y;
      row.forEach((area, k) => {
        const item = valid[rowStart + k];
        if (!item) return;
        const height = area / rowWidth;
        cells.push({ id: item.id, value: item.value, data: item.data, x: free.x, y, width: rowWidth, height });
        y += height;
      });
      free = { x: free.x + rowWidth, y: free.y, width: Math.max(0, free.width - rowWidth), height: free.height };
    } else {
      const rowHeight = sum / free.width;
      let x = free.x;
      row.forEach((area, k) => {
        const item = valid[rowStart + k];
        if (!item) return;
        const width = area / rowHeight;
        cells.push({ id: item.id, value: item.value, data: item.data, x, y: free.y, width, height: rowHeight });
        x += width;
      });
      free = { x: free.x, y: free.y + rowHeight, width: free.width, height: Math.max(0, free.height - rowHeight) };
    }
    rowStart += row.length;
    row = [];
  };

  let i = 0;
  while (i < areas.length) {
    const area = areas[i] ?? 0;
    const side = Math.min(free.width, free.height);
    if (row.length === 0 || worstRatio(row, side) >= worstRatio([...row, area], side)) {
      row.push(area);
      i++;
    } else {
      layoutRow();
    }
  }
  if (row.length > 0) layoutRow();
  return cells;
}

export interface TreemapGroup<T> {
  id: string;
  label: string;
  items: TreemapItem<T>[];
}

export interface GroupedTreemapGroup<T> extends Rect {
  id: string;
  label: string;
  value: number;
  /** false si el grupo es demasiado pequeño para mostrar cabecera. */
  showHeader: boolean;
  cells: TreemapCell<T>[];
}

export interface GroupedTreemapOptions {
  headerHeight: number;
  padding: number;
  /** Altura mínima del grupo para reservar cabecera. */
  minHeightForHeader: number;
}

/** Treemap de dos niveles (p. ej. sector → empresa). */
export function groupedTreemap<T>(
  groups: readonly TreemapGroup<T>[],
  rect: Rect,
  options: GroupedTreemapOptions,
): GroupedTreemapGroup<T>[] {
  const totals = groups.map((g) => ({
    id: g.id,
    value: g.items.reduce((sum, item) => sum + (Number.isFinite(item.value) && item.value > 0 ? item.value : 0), 0),
    data: g,
  }));
  return squarify(totals, rect).map((cell) => {
    const { headerHeight, padding, minHeightForHeader } = options;
    const showHeader = cell.height >= minHeightForHeader && cell.width >= minHeightForHeader;
    const top = showHeader ? headerHeight : padding;
    const inner: Rect = {
      x: cell.x + padding,
      y: cell.y + top,
      width: Math.max(0, cell.width - padding * 2),
      height: Math.max(0, cell.height - top - padding),
    };
    return {
      id: cell.id,
      label: cell.data.label,
      value: cell.value,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      showHeader,
      cells: squarify(cell.data.items, inner),
    };
  });
}
