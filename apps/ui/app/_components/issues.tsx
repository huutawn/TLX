"use client";

import { AlertTriangle, Bug, Copy } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { isTlxVisualScanIssue, type TlxScanIssue } from "@tlx/contracts";
import { issueArea, issueDetails, issueViewport, screenshotUrl, severityTone } from "../_lib/format";
import { CopyButton, EmptyState, KeyValue } from "./ui";

export function IssueList({ issues, selectedIssue, onSelect }: { issues: TlxScanIssue[]; selectedIssue?: TlxScanIssue; onSelect(issue: TlxScanIssue): void }) {
  if (issues.length === 0) {
    return <EmptyState title="No visual issues" detail="Latest report has no issues, or no scan has run yet." />;
  }

  return (
    <div className="grid gap-2">
      {issues.map((issue) => (
        <button key={issue.id} className={`issue-card ${selectedIssue?.id === issue.id ? "issue-card-active" : ""}`} onClick={() => onSelect(issue)}>
          <span className={`issue-icon tone-${severityTone(issue.severity)}`}>
            <Bug size={16} />
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-[15px] font-bold text-slate-100">{issueTitle(issue)}</span>
            <span className="mt-1 block truncate text-[14px] text-slate-400">{issue.message}</span>
            <span className="mt-2 flex flex-wrap gap-2 text-[12px] text-slate-500">
              <span>{issue.route}</span>
              <span>{issueViewport(issue)}</span>
              <span>{issueArea(issue)}</span>
              {issue.metadata.evidence ? <span>{String(issue.metadata.evidence)}</span> : null}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function ScreenshotViewer({ issue }: { issue?: TlxScanIssue }) {
  const image = screenshotUrl(issue);
  const [actualSize, setActualSize] = useState<{ width: number; height: number }>();

  if (!issue) {
    return <EmptyState title="Select an issue" detail="Bounding box and screenshot metadata appear here." />;
  }

  if (!image) {
    if (!isVisualIssue(issue)) {
      return <EmptyState title="Non-visual check" detail="Crawler and API checks do not produce bounding-box screenshots." />;
    }

    return (
      <InvalidArtifact issue={issue} reason="Visual issue has no screenshotPath. Rerun scan; scanner did not capture required artifact." />
    );
  }

  const dimensions = viewportDimensions(issue);
  if (!dimensions) {
    return <InvalidArtifact issue={issue} reason="Visual issue has no viewportWidth/viewportHeight metadata, so overlay cannot be scaled honestly." />;
  }

  const { sourceWidth, sourceHeight } = dimensions;
  const sizeMismatch = actualSize && (Math.abs(actualSize.width - sourceWidth) > 1 || Math.abs(actualSize.height - sourceHeight) > 1);
  const primaryStyle = boxStyle(issue.boundingBox, sourceWidth, sourceHeight, 1);
  const evidenceStyle = evidenceBox(issue) ? boxStyle(evidenceBox(issue)!, sourceWidth, sourceHeight, 0.5) : undefined;

  return (
    <div className="screenshot-frame">
      <div className="browser-chrome">
        <span />
        <span />
        <span />
        <code>{issue.url}</code>
      </div>
      <div className="relative overflow-auto bg-slate-950">
        {sizeMismatch ? (
          <div className="m-3 rounded-md border border-amber-400/50 bg-amber-950/40 px-3 py-2 text-[13px] leading-5 text-amber-100">
            Screenshot metadata mismatch: report says {sourceWidth}x{sourceHeight}px, file is {actualSize.width}x{actualSize.height}px. Overlay may be scaled wrong.
          </div>
        ) : null}
        <Image className="block h-auto w-full min-w-[720px]" src={image} alt={issue.message} width={sourceWidth} height={sourceHeight} unoptimized onLoadingComplete={(img) => setActualSize({ width: img.naturalWidth, height: img.naturalHeight })} />
        {evidenceStyle ? <div className="bug-box-evidence" style={evidenceStyle} /> : null}
        <div className="bug-box" style={primaryStyle} />
      </div>
    </div>
  );
}

export function IssueInspector({ issue }: { issue?: TlxScanIssue }) {
  if (!issue) {
    return <EmptyState title="No issue selected" detail="Choose an issue from the list to inspect route, viewport, and fix metadata." />;
  }

  const detail = issueDetails(issue);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[24px] font-black tracking-normal text-slate-100">{inspectorTitle(issue)}</h2>
        <p className="mt-2 text-[14px] text-slate-400">
          {issue.kind} · {issue.severity} · {elementLabel(issue)} · {issueArea(issue)}
        </p>
        <p className="mt-3 text-[15px] leading-7 text-slate-300">{issue.message}</p>
      </div>
      <section className="panel">
        <h3 className="mb-3 text-[15px] font-bold text-slate-100">What was tested</h3>
        <p className="text-[15px] leading-7 text-slate-300">{issueTestDescription(issue)}</p>
      </section>
      <section className="panel">
        <h3 className="mb-3 text-[15px] font-bold text-slate-100">Suggested fix</h3>
        <p className="text-[15px] leading-7 text-slate-300">{String(issue.metadata.fixHint ?? issue.metadata.evidence ?? "Inspect layout constraints around the highlighted element.")}</p>
      </section>
      <section className="panel">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-bold text-slate-100">Report fragment</h3>
          <button className="icon-btn" title="Copy issue JSON" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(detail, null, 2))}>
            <Copy size={16} />
          </button>
        </div>
        <pre className="code-box">{JSON.stringify(detail, null, 2)}</pre>
      </section>
      <section className="panel">
        <h3 className="mb-3 text-[15px] font-bold text-slate-100">Triage fields</h3>
        <KeyValue label="Route" value={issue.route} />
        <KeyValue label="Viewport" value={issueViewport(issue)} />
        <KeyValue label="Scanner" value={issue.kind} />
        <KeyValue label="Element" value={elementLabel(issue)} />
        <KeyValue label="Area" value={issueArea(issue)} />
        <KeyValue label="Selector" value={issue.selector} />
        <KeyValue label="Primary box" value={formatBox(issue.boundingBox)} />
        {evidenceBox(issue) ? <KeyValue label="Evidence box" value={formatBox(evidenceBox(issue)!)} /> : null}
        <div className="mt-4"><CopyButton value={JSON.stringify(detail, null, 2)} label="Copy JSON" /></div>
      </section>
    </div>
  );
}

function InvalidArtifact({ issue, reason }: { issue: TlxScanIssue; reason: string }) {
  return (
    <div className="screenshot-empty border-red-500/60 bg-red-950/10 text-left">
      <div className="mx-auto max-w-[560px] space-y-3">
        <div className="flex items-center justify-center gap-2 text-red-200">
          <AlertTriangle size={22} />
          <p className="text-[15px] font-bold">Invalid visual scan artifact</p>
        </div>
        <p className="text-center text-[14px] leading-6 text-slate-300">{reason}</p>
        <div className="grid gap-2 rounded-md border border-slate-800 bg-slate-950/70 p-3 text-[13px] text-slate-400">
          <span>route: {issue.route}</span>
          <span>viewport: {issueViewport(issue)}</span>
          <span>selector: {issue.selector}</span>
          <span>box: {issue.boundingBox.x}:{issue.boundingBox.y} {issue.boundingBox.width}x{issue.boundingBox.height}</span>
        </div>
      </div>
    </div>
  );
}

export function isVisualIssue(issue: TlxScanIssue) {
  return isTlxVisualScanIssue(issue);
}

export function viewportDimensions(issue: TlxScanIssue) {
  const sourceWidth = positiveNumber(issue.metadata.screenshotWidth ?? issue.metadata.viewportWidth ?? issue.metadata.width);
  const sourceHeight = positiveNumber(issue.metadata.screenshotHeight ?? issue.metadata.viewportHeight ?? issue.metadata.height);
  if (!sourceWidth || !sourceHeight) return undefined;
  return { sourceWidth, sourceHeight };
}

export function boxStyle(box: { x: number; y: number; width: number; height: number }, sourceWidth: number, sourceHeight: number, minPercent: number) {
  return {
    left: `${(box.x / sourceWidth) * 100}%`,
    top: `${(box.y / sourceHeight) * 100}%`,
    width: `${Math.max(minPercent, (box.width / sourceWidth) * 100)}%`,
    height: `${Math.max(minPercent, (box.height / sourceHeight) * 100)}%`,
  };
}

export function evidenceBox(issue: TlxScanIssue) {
  const value = issue.metadata.evidenceBox;
  if (!isBox(value)) return undefined;
  return value;
}

function isBox(value: unknown): value is { x: number; y: number; width: number; height: number } {
  if (!value || typeof value !== "object") return false;
  const box = value as Record<string, unknown>;
  return finiteNumber(box.x) !== undefined && finiteNumber(box.y) !== undefined && positiveNumber(box.width) !== undefined && positiveNumber(box.height) !== undefined;
}

function formatBox(box: { x: number; y: number; width: number; height: number }) {
  return `${formatNumber(box.x)}:${formatNumber(box.y)} ${formatNumber(box.width)}x${formatNumber(box.height)}`;
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function issueTitle(issue: TlxScanIssue) {
  if (issue.kind === "overlap") return "Overlap";
  if (issue.kind === "overflow") return "Horizontal overflow";
  if (issue.kind === "contrast") return "Low contrast";
  if (issue.kind === "color_harmony") return "OKLCH harmony";
  if (issue.kind === "alignment") return "Alignment";
  if (issue.kind === "spacing") return "Spacing";
  if (issue.kind === "typography") return "Typography";
  if (issue.kind === "orphan") return "Orphan element";
  if (issue.kind === "hit_area") return "Hit area";
  if (issue.kind === "tap_target_spacing") return "Tap target spacing";
  if (issue.kind === "text_clipping") return "Text clipping";
  if (issue.kind === "line_height_collision") return "Line-height collision";
  if (issue.kind === "local_scroll") return "Local horizontal scroll";
  if (issue.kind === "fixed_occlusion") return "Fixed header occlusion";
  if (issue.kind === "accessible_name") return "Missing accessible name";
  if (issue.kind === "broken_image") return "Broken image";
  if (issue.kind === "crawler") return "Crawler";
  if (issue.kind === "api") return "API";
  return issue.kind;
}

function inspectorTitle(issue: TlxScanIssue) {
  return `${issueTitle(issue)}: ${elementLabel(issue)} in ${issueArea(issue)}`;
}

function elementLabel(issue: TlxScanIssue) {
  return String(issue.metadata.elementLabel ?? issue.metadata.elementText ?? issue.selector ?? "document");
}

function issueTestDescription(issue: TlxScanIssue) {
  if (issue.kind === "overlap") {
    return `Checked element geometry plus browser hit-test evidence. Selector ${issue.selector} overlaps ${String(issue.metadata.otherSelector ?? "unknown selector")}; overlap ratio ${String(issue.metadata.overlapRatio ?? "unknown")}.`;
  }
  if (issue.kind === "overflow") {
    return `Checked horizontal viewport bounds. Evidence ${String(issue.metadata.evidence ?? "unknown")}; overflowX ${String(issue.metadata.overflowX ?? "unknown")}.`;
  }
  if (issue.kind === "contrast") {
    return `Checked WCAG text contrast. Ratio ${String(issue.metadata.ratio ?? "unknown")}:1 against required scan threshold; text ${String(issue.metadata.color ?? "unknown")}, background ${String(issue.metadata.backgroundColor ?? "unknown")}.`;
  }
  if (issue.kind === "color_harmony") {
    const routeDrift = issue.metadata.routeHueDrift ? ` Route drift ${String(issue.metadata.routeHueDrift)}deg from global palette.` : "";
    return `Checked OKLCH palette harmony. Score ${String(issue.metadata.score ?? "unknown")}; dominant hue ${String(issue.metadata.dominantHue ?? "neutral")}; strong hue families ${String(issue.metadata.strongHueFamilies ?? "unknown")}; high-chroma area ${String(issue.metadata.highChromaAreaRatio ?? "unknown")}.${routeDrift}`;
  }
  if (issue.kind === "alignment") {
    return `Checked nearby component alignment. Axis ${String(issue.metadata.axis ?? "unknown")}; drift ${String(issue.metadata.driftPx ?? "unknown")}px from expected ${String(issue.metadata.expectedPx ?? "unknown")}px.`;
  }
  if (issue.kind === "spacing") {
    return `Checked sibling gap consistency. Axis ${String(issue.metadata.axis ?? "unknown")}; gap ${String(issue.metadata.gapPx ?? "unknown")}px; expected near ${String(issue.metadata.expectedGapPx ?? "unknown")}px.`;
  }
  if (issue.kind === "typography") {
    const evidence = String(issue.metadata.evidence ?? "unknown");
    if (evidence === "type-scale-hierarchy") {
      return `Checked heading hierarchy in ${issueArea(issue)}. Element ${elementLabel(issue)} is ${String(issue.metadata.fontSizePx ?? "unknown")}px; nearby body median is ${String(issue.metadata.bodyMedianPx ?? "unknown")}px; font weight is ${String(issue.metadata.fontWeight ?? "unknown")}.`;
    }
    return `Checked font size, type hierarchy, line-height, and font-family consistency for ${elementLabel(issue)} in ${issueArea(issue)}. Evidence ${evidence}.`;
  }
  if (issue.kind === "orphan") {
    return `Checked element distance from nearby UI clusters. Distance ${String(issue.metadata.distancePx ?? "unknown")}px; threshold ${String(issue.metadata.thresholdPx ?? "unknown")}px.`;
  }
  if (issue.kind === "hit_area") {
    return `Checked interactive target size for ${elementLabel(issue)} in ${issueArea(issue)}. Box ${String(issue.metadata.widthPx ?? "unknown")}x${String(issue.metadata.heightPx ?? "unknown")}px; minimum ${String(issue.metadata.expectedMinPx ?? "unknown")}px.`;
  }
  if (issue.kind === "tap_target_spacing") {
    return `Checked touch target spacing. Distance ${String(issue.metadata.distancePx ?? "unknown")}px from ${String(issue.metadata.otherSelector ?? "unknown selector")}; expected at least ${String(issue.metadata.expectedGapPx ?? "unknown")}px.`;
  }
  if (issue.kind === "text_clipping") {
    return `Checked text overflow and clipping metrics. scroll/client ${String(issue.metadata.scrollWidth ?? "unknown")}/${String(issue.metadata.clientWidth ?? "unknown")} width, ${String(issue.metadata.scrollHeight ?? "unknown")}/${String(issue.metadata.clientHeight ?? "unknown")} height.`;
  }
  if (issue.kind === "line_height_collision") {
    return `Checked wrapped text line-height. Ratio ${String(issue.metadata.lineHeightRatio ?? "unknown")}; font ${String(issue.metadata.fontSizePx ?? "unknown")}px; line-height ${String(issue.metadata.lineHeightPx ?? "unknown")}px.`;
  }
  if (issue.kind === "local_scroll") {
    return `Checked local scroll containers. Element scroll/client width ${String(issue.metadata.scrollWidth ?? "unknown")}/${String(issue.metadata.clientWidth ?? "unknown")}; overflow ${String(issue.metadata.overflowX ?? issue.metadata.overflowStyle ?? "unknown")}.`;
  }
  if (issue.kind === "fixed_occlusion") {
    return `Checked anchor/focus scrolling against fixed and sticky elements. Occluder ${String(issue.metadata.occluderSelector ?? "unknown")} covers ${issue.selector}.`;
  }
  if (issue.kind === "accessible_name") {
    return `Checked accessible names for interactive controls. Source ${String(issue.metadata.accessibleNameSource ?? "missing")}; role ${String(issue.metadata.role ?? "unknown")}.`;
  }
  if (issue.kind === "broken_image") {
    return `Checked image load result. Source ${String(issue.metadata.imageSrc ?? "unknown")}; natural size ${String(issue.metadata.naturalWidth ?? "unknown")}x${String(issue.metadata.naturalHeight ?? "unknown")}.`;
  }
  if (issue.kind === "crawler") return "Checked local route health, internal link crawl safety, and console errors.";
  if (issue.kind === "api") return "Checked discovered API endpoint response status and JSON validity.";
  return "Checked scanner rule metadata for this issue.";
}
