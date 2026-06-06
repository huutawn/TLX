"use client";

import { DashboardDataProvider } from "../_lib/dashboard-data";
import { BugsView } from "./bugs-view";
import { DashboardShell } from "./dashboard-shell";
import { MapView } from "./map-view";
import { OverviewView } from "./overview-view";
import { TestsView } from "./tests-view";

export type DashboardRoute = "overview" | "map" | "tests" | "bugs";

export function DashboardView({ view }: { view: DashboardRoute }) {
  return (
    <DashboardDataProvider>
      <DashboardShell view={view}>{renderView(view)}</DashboardShell>
    </DashboardDataProvider>
  );
}

function renderView(view: DashboardRoute) {
  switch (view) {
    case "map":
      return <MapView />;
    case "tests":
      return <TestsView />;
    case "bugs":
      return <BugsView />;
    default:
      return <OverviewView />;
  }
}

