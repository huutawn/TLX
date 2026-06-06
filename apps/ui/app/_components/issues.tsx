"use client";

import { AlertTriangle, Bug, Copy } from "lucide-react";
import Image from "next/image";
import type { TlxScanIssue } from "@tlx/contracts";
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

  if (!issue) {
    return <EmptyState title="Select an issue" detail="Bounding box and screenshot metadata appear here." />;
  }

  if (!isVisualIssue(issue)) {
    return <EmptyState title="Non-visual check" detail="Crawler and API checks do not produce bounding-box screenshots." />;
  }

  if (!image) {
    return (
      <InvalidArtifact issue={issue} reason="Visual issue has no screenshotPath. Rerun scan; scanner did not capture required artifact." />
    );
  }

  const dimensions = viewportDimensions(issue);
  if (!dimensions) {
    return <InvalidArtifact issue={issue} reason="Visual issue has no viewportWidth/viewportHeight metadata, so overlay cannot be scaled honestly." />;
  }

  const { sourceWidth, sourceHeight } = dimensions;
  const left = (issue.boundingBox.x / sourceWidth) * 100;
  const top = (issue.boundingBox.y / sourceHeight) * 100;
  const width = Math.max(1, (issue.boundingBox.width / sourceWidth) * 100);
  const height = Math.max(1, (issue.boundingBox.height / sourceHeight) * 100);

  return (
    <div className="screenshot-frame">
      <div className="browser-chrome">
        <span />
        <span />
        <span />
        <code>{issue.url}</code>
      </div>
      <div className="relative overflow-auto bg-slate-950">
        <Image className="block h-auto w-full min-w-[720px]" src={image} alt={issue.message} width={sourceWidth} height={sourceHeight} unoptimized />
        <div className="bug-box" style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} />
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
        <h2 className="text-[24px] font-black tracking-normal text-slate-100">{issue.message}</h2>
        <p className="mt-2 text-[14px] text-slate-400">
          {issue.kind} · {issue.severity} · {issueArea(issue)}
        </p>
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
        <KeyValue label="Box" value={`${issue.boundingBox.x}:${issue.boundingBox.y} ${issue.boundingBox.width}x${issue.boundingBox.height}`} />
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

function isVisualIssue(issue: TlxScanIssue) {
  return issue.kind === "overlap" || issue.kind === "overflow" || issue.kind === "contrast";
}

function viewportDimensions(issue: TlxScanIssue) {
  const sourceWidth = positiveNumber(issue.metadata.screenshotWidth ?? issue.metadata.viewportWidth ?? issue.metadata.width);
  const sourceHeight = positiveNumber(issue.metadata.screenshotHeight ?? issue.metadata.viewportHeight ?? issue.metadata.height);
  if (!sourceWidth || !sourceHeight) return undefined;
  return { sourceWidth, sourceHeight };
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function issueTitle(issue: TlxScanIssue) {
  if (issue.kind === "overlap") return "Overlap";
  if (issue.kind === "overflow") return "Horizontal overflow";
  if (issue.kind === "contrast") return "Low contrast";
  if (issue.kind === "crawler") return "Crawler";
  if (issue.kind === "api") return "API";
  return issue.kind;
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
  if (issue.kind === "crawler") return "Checked local route health, internal link crawl safety, and console errors.";
  if (issue.kind === "api") return "Checked discovered API endpoint response status and JSON validity.";
  return "Checked scanner rule metadata for this issue.";
}
