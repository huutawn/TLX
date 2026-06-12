import type { TlxBoundingBox, TlxColorAnalysisThresholds, TlxRouteColorAnalysis, TlxScanIssue } from '@tlx/contracts';

export interface ScannedElement {
  selector: string;
  tagName: string;
  text: string;
  boundingBox: TlxBoundingBox;
  color: string;
  backgroundColor: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  lineHeight?: number;
  letterSpacing?: number;
  display?: string;
  position?: string;
  role?: string;
  ariaLabel?: string;
  title?: string;
  alt?: string;
  name?: string;
  placeholder?: string;
  value?: string;
  associatedLabelText?: string;
  accessibleName?: string;
  accessibleNameSource?: string;
  parentSelector?: string;
  childrenSelectors?: string[];
  margin?: BoxEdges;
  padding?: BoxEdges;
  overflowX?: string;
  overflowY?: string;
  whiteSpace?: string;
  textOverflow?: string;
  scrollWidth?: number;
  scrollHeight?: number;
  clientWidth?: number;
  clientHeight?: number;
  lineClamp?: string;
  lineBoxCount?: number;
  lineBoxMinGap?: number;
  currentSrc?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  complete?: boolean;
  colorSamples?: Array<{ role: string; value: string }>;
  areaLabel?: string;
  areaSelector?: string;
  ancestorSelectors?: string[];
  interactiveAncestorSelector?: string;
  occludes?: string[];
}

export interface BoxEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface VisualQualityThresholds {
  enabled: boolean;
  alignmentTolerancePx: number;
  alignmentMaxDriftPx: number;
  spacingGridPx: number;
  spacingTolerancePx: number;
  spacingMedianDriftPx: number;
  orphanDistancePx: number;
  minDesktopHitTargetPx: number;
  minMobileHitTargetPx: number;
  minTapTargetGapPx: number;
  minReadableFontPx: number;
  minMobileReadableFontPx: number;
  minInteractiveFontPx: number;
  minLineHeightRatio: number;
  maxLocalScrollOverflowPx: number;
  fixedOcclusionProbeEnabled: boolean;
}

export interface AnalyzeOptions {
  route: string;
  url: string;
  viewport: { width: number; height: number };
  contrastRatio: number;
  colorHarmony?: {
    enabled: boolean;
    thresholds: TlxColorAnalysisThresholds;
  };
  visualQuality?: Partial<VisualQualityThresholds>;
  viewportName?: string;
  issuePrefix: string;
  pageMetrics?: { scrollWidth: number; clientWidth: number; scrollHeight?: number; clientHeight?: number };
  pageState?: { title: string; url: string; textSample: string };
}

export interface AnalyzeResult {
  issues: TlxScanIssue[];
  elementsScanned: number;
  colorAnalysis?: TlxRouteColorAnalysis;
}
