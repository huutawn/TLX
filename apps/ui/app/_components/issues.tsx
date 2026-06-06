"use client";

import { Bug, Copy, ImageOff } from "lucide-react";
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
            <span className="block truncate text-[15px] font-bold text-slate-100">{issue.kind}</span>
            <span className="mt-1 block truncate text-[14px] text-slate-400">{issue.message}</span>
            <span className="mt-2 flex flex-wrap gap-2 text-[12px] text-slate-500">
              <span>{issue.route}</span>
              <span>{issueViewport(issue)}</span>
              <span>{issueArea(issue)}</span>
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

  if (!image) {
    return (
      <div className="screenshot-empty">
        <ImageOff size={28} />
        <p>No screenshot captured for this issue.</p>
      </div>
    );
  }

  const sourceWidth = Number(issue.metadata.viewportWidth ?? issue.metadata.width ?? 1280);
  const sourceHeight = Number(issue.metadata.viewportHeight ?? issue.metadata.height ?? 800);
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
