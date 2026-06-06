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
    viewport: issue.metadata.viewport ?? issue.metadata.viewportName,
    area: issue.metadata.areaLabel,
    selector: issue.selector,
    areaSelector: issue.metadata.areaSelector,
    otherSelector: issue.metadata.otherSelector,
    evidence: issue.metadata.evidence,
    fixHint: issue.metadata.fixHint,
    boundingBox: issue.boundingBox,
    message: issue.message,
  };
}

