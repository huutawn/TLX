import type { TlxScanIssue, TlxScanIssueSeverity } from "@tlx/contracts";

export function compactPath(value?: string) {
  if (!value) return "-";
  const normalized = value.replace(/\\/g, "/");
  if (normalized.length <= 42) return normalized;
  return `...${normalized.slice(-39)}`;
}

export function formatUptime(seconds?: number) {
  if (!seconds || seconds < 0) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function screenshotUrl(issue?: TlxScanIssue) {
  if (!issue?.screenshotPath) return undefined;
  return `/${issue.screenshotPath.replace(/^\.\//, "")}`;
}

export function severityTone(severity?: TlxScanIssueSeverity) {
  if (severity === "error") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

export function issueViewport(issue: TlxScanIssue) {
  return String(issue.metadata.viewport ?? issue.metadata.viewportName ?? "unknown");
}

export function issueArea(issue: TlxScanIssue) {
  return String(issue.metadata.areaLabel ?? issue.selector ?? "unknown area");
}

export function issueDetails(issue: TlxScanIssue) {
  return {
    kind: issue.kind,
    severity: issue.severity,
    route: issue.route,
    url: issue.url,
    capturedUrl: issue.metadata.capturedUrl,
    pageTitle: issue.metadata.pageTitle,
    textSample: issue.metadata.textSample,
    viewport: issue.metadata.viewport ?? issue.metadata.viewportName,
    area: issue.metadata.areaLabel,
    element: issue.metadata.elementLabel,
    selector: issue.selector,
    elementSelector: issue.metadata.elementSelector,
    areaSelector: issue.metadata.areaSelector,
    otherSelector: issue.metadata.otherSelector,
    targetSelector: issue.metadata.targetSelector,
    occluderSelector: issue.metadata.occluderSelector,
    siblingSelector: issue.metadata.siblingSelector,
    evidence: issue.metadata.evidence,
    evidenceBox: issue.metadata.evidenceBox,
    otherBoundingBox: issue.metadata.otherBoundingBox,
    occluderBoundingBox: issue.metadata.occluderBoundingBox,
    siblingBoundingBox: issue.metadata.siblingBoundingBox,
    distancePx: issue.metadata.distancePx,
    expectedGapPx: issue.metadata.expectedGapPx,
    overflowX: issue.metadata.overflowX,
    scrollWidth: issue.metadata.scrollWidth,
    clientWidth: issue.metadata.clientWidth,
    scrollHeight: issue.metadata.scrollHeight,
    clientHeight: issue.metadata.clientHeight,
    accessibleNameSource: issue.metadata.accessibleNameSource,
    imageSrc: issue.metadata.imageSrc,
    lineHeightRatio: issue.metadata.lineHeightRatio,
    lineBoxCount: issue.metadata.lineBoxCount,
    fixHint: issue.metadata.fixHint,
    score: issue.metadata.score,
    dominantHue: issue.metadata.dominantHue,
    globalDominantHue: issue.metadata.globalDominantHue,
    hueSpread: issue.metadata.hueSpread,
    highChromaAreaRatio: issue.metadata.highChromaAreaRatio,
    strongHueFamilies: issue.metadata.strongHueFamilies,
    palette: issue.metadata.palette,
    boundingBox: issue.boundingBox,
    message: issue.message,
  };
}
