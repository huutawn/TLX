import { describe, expect, test } from "bun:test";
import type { TlxScanIssue } from "@tlx/contracts";
import { boxStyle, evidenceBox, isVisualIssue, viewportDimensions } from "./issues";
import { screenshotUrl } from "../_lib/format";

describe("dashboard issue artifact helpers", () => {
  test("renders visual artifact URL and full-page overlay percentages", () => {
    const issue = sampleIssue({
      screenshotPath: ".tlx/screenshots/report-1/home-desktop.png",
      boundingBox: { x: 100, y: 800, width: 200, height: 120 },
      metadata: {
        viewport: "desktop",
        viewportWidth: 1000,
        viewportHeight: 700,
        screenshotWidth: 1000,
        screenshotHeight: 1600,
        evidenceBox: { x: 90, y: 790, width: 240, height: 160 },
      },
    });

    expect(isVisualIssue(issue)).toBe(true);
    expect(screenshotUrl(issue)).toBe("/.tlx/screenshots/report-1/home-desktop.png");
    expect(viewportDimensions(issue)).toEqual({ sourceWidth: 1000, sourceHeight: 1600 });
    expect(boxStyle(issue.boundingBox, 1000, 1600, 1)).toEqual({ left: "10%", top: "50%", width: "20%", height: "7.5%" });
    expect(evidenceBox(issue)).toEqual({ x: 90, y: 790, width: 240, height: 160 });
  });

  test("distinguishes non-visual and invalid visual artifacts", () => {
    const crawler = sampleIssue({ kind: "crawler", screenshotPath: undefined, metadata: {} });
    const invalidVisual = sampleIssue({ screenshotPath: undefined, metadata: { viewport: "desktop" } });

    expect(isVisualIssue(crawler)).toBe(false);
    expect(screenshotUrl(crawler)).toBeUndefined();
    expect(isVisualIssue(invalidVisual)).toBe(true);
    expect(viewportDimensions(invalidVisual)).toBeUndefined();
  });
});

function sampleIssue(overrides: Partial<TlxScanIssue> = {}): TlxScanIssue {
  return {
    id: "issue-1",
    kind: "overflow",
    severity: "error",
    message: "Page overflows. Fix: constrain width.",
    route: "/",
    url: "http://localhost:3000/",
    selector: "#wide",
    boundingBox: { x: 0, y: 0, width: 100, height: 40 },
    metadata: {},
    ...overrides,
  };
}
