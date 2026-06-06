import type { ReactNode } from "react";

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title || action ? (
        <div className="mb-4 flex min-h-6 items-center justify-between gap-3">
          {title ? <h2 className="text-[15px] font-semibold text-slate-100">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function MetricCard({ label, value, detail, tone = "default" }: { label: string; value: string; detail?: string; tone?: "default" | "good" | "warn" | "bad" | "info" }) {
  return (
    <section className={`metric-card tone-${tone}`}>
      <div className="text-[30px] font-black leading-none tracking-normal text-slate-100 md:text-[34px]">{value}</div>
      <div className="mt-2 text-[15px] text-slate-400">{label}</div>
      {detail ? <div className="mt-3 truncate text-[13px] text-slate-500">{detail}</div> : null}
    </section>
  );
}

export function StatusPill({ label, tone = "info" }: { label: string; tone?: "good" | "warn" | "bad" | "info" | "muted" }) {
  return (
    <span className={`status-pill status-${tone}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function CommandButton({ children, active = false, disabled = false, onClick }: { children: ReactNode; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button className={`command-btn ${active ? "command-btn-active" : ""}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty-state">
      <p className="text-[15px] font-semibold text-slate-200">{title}</p>
      {detail ? <p className="mt-1 text-[14px] leading-6 text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="key-value">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-slate-200">{value}</span>
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  return (
    <button className="small-btn" onClick={() => void navigator.clipboard?.writeText(value)}>
      {label}
    </button>
  );
}

