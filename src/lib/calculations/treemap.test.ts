import { groupedTreemap, type Rect, squarify, type TreemapCell } from "./treemap";

const RECT: Rect = { x: 0, y: 0, width: 1000, height: 600 };
const EPS = 1e-6;

function items(values: number[]) {
  return values.map((value, i) => ({ id: `i${i}`, value, data: i }));
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x + EPS < b.x + b.width && b.x + EPS < a.x + a.width && a.y + EPS < b.y + b.height && b.y + EPS < a.y + a.height;
}

function assertValidLayout(cells: TreemapCell<unknown>[], rect: Rect) {
  for (const c of cells) {
    expect(c.x).toBeGreaterThanOrEqual(rect.x - EPS);
    expect(c.y).toBeGreaterThanOrEqual(rect.y - EPS);
    expect(c.x + c.width).toBeLessThanOrEqual(rect.x + rect.width + EPS);
    expect(c.y + c.height).toBeLessThanOrEqual(rect.y + rect.height + EPS);
  }
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
    }
  }
}

describe("squarify", () => {
  it("fills the rectangle exactly with areas proportional to values", () => {
    const values = [6, 6, 4, 3, 2, 2, 1];
    const cells = squarify(items(values), RECT);
    const total = values.reduce((a, b) => a + b, 0);
    const area = cells.reduce((sum, c) => sum + c.width * c.height, 0);
    expect(area).toBeCloseTo(RECT.width * RECT.height, 3);
    for (const c of cells) {
      expect((c.width * c.height) / (RECT.width * RECT.height)).toBeCloseTo(c.value / total, 6);
    }
    assertValidLayout(cells, RECT);
  });

  it("ignores zero, negative and non-finite values", () => {
    const cells = squarify(items([5, 0, -3, Number.NaN, 5]), RECT);
    expect(cells.map((c) => c.id).sort()).toEqual(["i0", "i4"]);
  });

  it("handles empty input and degenerate rectangles", () => {
    expect(squarify([], RECT)).toEqual([]);
    expect(squarify(items([1, 2]), { x: 0, y: 0, width: 0, height: 10 })).toEqual([]);
  });

  it("keeps aspect ratios reasonable for many items", () => {
    const cells = squarify(items(Array.from({ length: 120 }, (_, i) => 1 + (i % 17) * 3)), RECT);
    assertValidLayout(cells, RECT);
    const worst = Math.max(...cells.map((c) => Math.max(c.width / c.height, c.height / c.width)));
    expect(worst).toBeLessThan(12);
  });

  it("is deterministic regardless of input order", () => {
    const a = squarify(items([3, 1, 2]), RECT);
    const b = squarify([...items([3, 1, 2])].reverse(), RECT);
    expect(a).toEqual(b);
  });
});

describe("groupedTreemap", () => {
  it("nests children inside their group rectangle below the header", () => {
    const groups = [
      { id: "tech", label: "Tech", items: items([10, 5, 3]) },
      { id: "energy", label: "Energy", items: items([4, 2]) },
      { id: "empty", label: "Empty", items: items([0]) },
    ];
    const result = groupedTreemap(groups, RECT, { headerHeight: 18, padding: 1, minHeightForHeader: 40 });
    expect(result.map((g) => g.id).sort()).toEqual(["energy", "tech"]);
    for (const g of result) {
      const inner: Rect = { x: g.x, y: g.y + (g.showHeader ? 18 : 1), width: g.width, height: g.height };
      assertValidLayout(g.cells, { ...inner, height: g.height - (g.showHeader ? 18 : 1) });
    }
    const tech = result.find((g) => g.id === "tech");
    expect(tech?.value).toBe(18);
    expect(tech?.cells).toHaveLength(3);
  });
});
