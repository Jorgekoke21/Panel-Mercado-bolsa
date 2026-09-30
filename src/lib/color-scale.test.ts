import { heatBucket, heatClass, heatThresholds } from "./color-scale";

describe("heat colour scale", () => {
  it("keeps small moves neutral", () => {
    expect(heatBucket(0, "1D")).toBe(0);
    expect(heatBucket(0.004, "1D")).toBe(0);
    expect(heatBucket(-0.004, "1D")).toBe(0);
  });

  it("maps magnitudes to symmetric buckets", () => {
    expect(heatBucket(0.01, "1D")).toBe(1);
    expect(heatBucket(-0.02, "1D")).toBe(-2);
    expect(heatBucket(0.08, "1D")).toBe(3);
    expect(heatBucket(-0.5, "1D")).toBe(-3);
  });

  it("scales thresholds by time range", () => {
    expect(heatBucket(0.02, "1D")).toBe(2);
    expect(heatBucket(0.02, "1Y")).toBe(0);
    const [t1Day] = heatThresholds("1D");
    const [t1Year] = heatThresholds("1Y");
    expect(t1Year).toBeGreaterThan(t1Day);
  });

  it("returns null for missing values and a neutral class", () => {
    expect(heatBucket(null, "1D")).toBeNull();
    expect(heatBucket(Number.NaN, "1D")).toBeNull();
    expect(heatClass(undefined, "1D")).toContain("bg-heat-none");
    expect(heatClass(0.05, "1D")).toContain("bg-heat-p3");
  });
});
