"use client";

import dynamic from "next/dynamic";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartData,
  type ChartOptions,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Component, startTransition, useDeferredValue, useEffect, useState, type ErrorInfo, type ReactNode } from "react";

import type { BoiDashboardSummary, BoiPoint, BoiSeries } from "@/lib/boi-types";
import type { DashboardSummary, NumericPoint, PricePoint, RegionDashboard } from "@/lib/cbs-types";

const ReactChart = dynamic(
  () => import("react-chartjs-2").then((module) => module.Chart),
  {
    ssr: false,
  },
);

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

type ChartKind = "line" | "bar";

type SeriesPairConfig = {
  title: string;
  monthlyKey: string;
  annualKey: string;
  color: string;
  monthlyLabel: string;
  annualLabel: string;
  monthlyType?: ChartKind;
  annualType?: ChartKind;
};

const BOI_SECTION_CONFIG: Array<{ title: string; keys: string[] }> = [
  {
    title: "מוניטרי ומחירים",
    keys: ["policy_rate", "cpi_monthly_change", "inflation_expectations_1y", "rent_index"],
  },
  {
    title: "צמיחה ותעסוקה",
    keys: ["monthly_activity_index", "monthly_activity_index_3m_avg", "unemployment_rate", "real_wages"],
  },
  {
    title: "דיור ומימון",
    keys: ["housing_credit_total", "new_mortgage_rate", "new_mortgage_volume", "construction_cost_index"],
  },
  {
    title: "מגזר חיצוני",
    keys: ["usd_ils", "neer", "fx_reserves_usd", "current_account_pct_gdp"],
  },
  {
    title: "שוק ההון ופיסקלי",
    keys: ["gov_bond_yield_10y", "gov_deficit_monthly", "m1_money_supply", "gdp_growth"],
  },
];

const DEFAULT_COMPARE_REGIONS = ["ירושלים", "תל אביב", "המרכז", "הדרום"];

const REGION_SECTIONS: Array<{ title: string; items: SeriesPairConfig[] }> = [
  {
    title: "בנייה ומכירות",
    items: [
      {
        title: "היתרי בנייה",
        monthlyKey: "build_monthly",
        annualKey: "build_annual",
        monthlyLabel: "חודשי",
        annualLabel: "שנתי",
        color: "#0f766e",
        annualType: "bar",
      },
      {
        title: "בבנייה פעילה",
        monthlyKey: "active_quarterly",
        annualKey: "active_annual",
        monthlyLabel: "רבעוני",
        annualLabel: "שנתי",
        color: "#ea580c",
        annualType: "bar",
      },
      {
        title: "דירות חדשות שנמכרו",
        monthlyKey: "new_monthly",
        annualKey: "new_annual",
        monthlyLabel: "חודשי",
        annualLabel: "שנתי",
        color: "#2563eb",
        annualType: "bar",
      },
      {
        title: "דירות יד שנייה שנמכרו",
        monthlyKey: "secondhand_monthly",
        annualKey: "secondhand_annual",
        monthlyLabel: "חודשי",
        annualLabel: "שנתי",
        color: "#db2777",
        annualType: "bar",
      },
      {
        title: "סך הדירות שנמכרו",
        monthlyKey: "total_monthly",
        annualKey: "total_annual",
        monthlyLabel: "חודשי",
        annualLabel: "שנתי",
        color: "#7c3aed",
        annualType: "bar",
      },
      {
        title: "התחלות בנייה",
        monthlyKey: "starts_monthly",
        annualKey: "starts_annual",
        monthlyLabel: "חודשי",
        annualLabel: "שנתי",
        color: "#16a34a",
        annualType: "bar",
      },
      {
        title: "גמר בנייה",
        monthlyKey: "finish_monthly",
        annualKey: "finish_annual",
        monthlyLabel: "חודשי",
        annualLabel: "שנתי",
        color: "#0284c7",
        annualType: "bar",
      },
    ],
  },
  {
    title: "התחדשות עירונית",
    items: [
      {
        title: "דירות בבניינים שנבנו מחדש",
        monthlyKey: "start_total_q",
        annualKey: "start_total_a",
        monthlyLabel: "רבעוני",
        annualLabel: "שנתי",
        color: "#65a30d",
        annualType: "bar",
      },
      {
        title: "תמ״א 38/2 ופינוי בינוי",
        monthlyKey: "start_reconstruction_q",
        annualKey: "start_reconstruction_a",
        monthlyLabel: "רבעוני",
        annualLabel: "שנתי",
        color: "#0d9488",
        annualType: "bar",
      },
      {
        title: "תוספות לבניינים קיימים",
        monthlyKey: "start_additions_q",
        annualKey: "start_additions_a",
        monthlyLabel: "רבעוני",
        annualLabel: "שנתי",
        color: "#4f46e5",
        annualType: "bar",
      },
      {
        title: "תוספות לפי תמ״א 38",
        monthlyKey: "start_TAMA38q",
        annualKey: "start_TAMA38a",
        monthlyLabel: "רבעוני",
        annualLabel: "שנתי",
        color: "#ca8a04",
        annualType: "bar",
      },
      {
        title: "דירות שנהרסו",
        monthlyKey: "destroyed_apartments_q",
        annualKey: "destroyed_apartments_a",
        monthlyLabel: "רבעוני",
        annualLabel: "שנתי",
        color: "#dc2626",
        annualType: "bar",
      },
    ],
  },
];

const numberFormatter = new Intl.NumberFormat("he-IL");
const preciseFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 2,
});
const compactFormatter = new Intl.NumberFormat("he-IL", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function monthInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function yearsAgoMonthValue(yearsAgo: number, date = new Date()) {
  return monthInputValue(new Date(date.getFullYear() - yearsAgo, date.getMonth(), 1));
}

function yearValue(date = new Date()) {
  return String(date.getFullYear());
}

function generateMonthList(start: string, end: string) {
  const startDate = new Date(`${start}-01T00:00:00`);
  const endDate = new Date(`${end}-01T00:00:00`);
  const labels: string[] = [];

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return labels;
  }

  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    labels.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return labels;
}

function buildChainedIndex(series: PricePoint[], start: string, end: string) {
  const startIndex = series.findIndex((item) => item.date >= start);
  if (startIndex === -1) {
    return [] as Array<{ label: string; value: number }>;
  }

  const points: Array<{ label: string; value: number }> = [];
  let currentValue = 100;

  for (let index = startIndex; index < series.length; index += 1) {
    const point = series[index];
    if (point.date > end) {
      break;
    }

    if (index === startIndex) {
      points.push({ label: point.date, value: currentValue });
      continue;
    }

    currentValue *= 1 + point.percent / 100;
    points.push({ label: point.date, value: Number(currentValue.toFixed(4)) });
  }

  return points;
}

function alignSeries(masterLabels: string[], points: Array<{ label: string; value: number }>) {
  const pointMap = new Map(points.map((point) => [point.label, point.value]));
  return masterLabels.map((label) => pointMap.get(label) ?? null);
}

function filterByMonthRange(points: NumericPoint[], start: string, end: string) {
  return points.filter((point) => point.rawDate >= start && point.rawDate <= end);
}

function filterByYearRange(points: NumericPoint[], startYear: string, endYear: string) {
  const minYear = Number(startYear);
  const maxYear = Number(endYear);

  return points.filter((point) => {
    const year = Number(point.rawDate.slice(0, 4));
    return Number.isFinite(year) && year >= minYear && year <= maxYear;
  });
}

function boiMonthKey(rawDate: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return rawDate.slice(0, 7);
  }

  if (/^\d{4}-\d{2}$/.test(rawDate)) {
    return rawDate;
  }

  const quarterMatch = rawDate.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const [, year, quarter] = quarterMatch;
    const endMonth = String(Number(quarter) * 3).padStart(2, "0");
    return `${year}-${endMonth}`;
  }

  if (/^\d{4}$/.test(rawDate)) {
    return `${rawDate}-12`;
  }

  return null;
}

function filterBoiPointsByMonthRange(points: BoiPoint[], start: string, end: string) {
  return points.filter((point) => {
    const monthKey = boiMonthKey(point.date);

    return monthKey != null && monthKey >= start && monthKey <= end;
  });
}

function latestNumberLabel(value: number | null, suffix = "") {
  if (value == null) {
    return "אין נתון";
  }

  return `${numberFormatter.format(Number(value.toFixed(1)))}${suffix}`;
}

function latestCompactLabel(value: number | null) {
  if (value == null) {
    return "אין נתון";
  }

  return compactFormatter.format(value);
}

function boiMetricValue(value: number | null, unit?: string | null) {
  if (value == null) {
    return "אין נתון";
  }

  const formatted = Math.abs(value) >= 1_000 ? compactFormatter.format(value) : preciseFormatter.format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function boiSeriesDetail(series: BoiSeries) {
  const lastPoint = series.points.at(-1);

  if (!lastPoint) {
    return series.category ?? "ללא נקודת זמן אחרונה";
  }

  if (series.category) {
    return `${series.category} • נכון ל-${lastPoint.label}`;
  }

  return `נכון ל-${lastPoint.label}`;
}

function createChartOptions(kind: ChartKind, showLegend = false): ChartOptions<ChartKind> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        display: showLegend,
        position: "top",
        labels: {
          color: "#0f172a",
          boxWidth: 10,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        titleColor: "#f8fafc",
        bodyColor: "#e2e8f0",
        padding: 12,
      },
    },
    scales: {
      x: {
        grid: {
          color: "rgba(148, 163, 184, 0.15)",
        },
        ticks: {
          color: "#475569",
          maxRotation: kind === "bar" ? 0 : 35,
          minRotation: 0,
        },
      },
      y: {
        grid: {
          color: "rgba(148, 163, 184, 0.15)",
        },
        ticks: {
          color: "#475569",
        },
      },
    },
  };
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json()) as T & { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? "Request failed");
  }

  return body as T;
}

function ChartSurface({
  title,
  subtitle,
  type,
  data,
}: {
  title: string;
  subtitle?: string;
  type: ChartKind;
  data: ChartData<ChartKind>;
}) {
  const hasData = Boolean(data.labels?.length) && data.datasets.some((dataset) =>
    Array.isArray(dataset.data) ? dataset.data.some((value) => value != null) : false,
  );

  return (
    <article className="chart-panel p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#13202b]">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-[#5d6b7c]">{subtitle}</p> : null}
        </div>
      </div>

      {hasData ? (
        <div className="h-72">
          <ChartErrorBoundary title={title}>
            <ReactChart type={type} data={data} options={createChartOptions(type, data.datasets.length > 1)} />
          </ChartErrorBoundary>
        </div>
      ) : (
        <div className="flex h-72 items-center justify-center rounded-3xl border border-dashed border-[rgba(15,23,42,0.12)] bg-[rgba(241,245,249,0.72)] text-sm text-[#5d6b7c]">
          אין נתונים לטווח שנבחר
        </div>
      )}
    </article>
  );
}

type ChartErrorBoundaryProps = {
  children: ReactNode;
  title: string;
};

type ChartErrorBoundaryState = {
  hasError: boolean;
};

class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  override state: ChartErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return {
      hasError: true,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Chart render failed for ${this.props.title}`, error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-72 items-center justify-center rounded-3xl border border-dashed border-amber-300 bg-amber-50 px-6 text-center text-sm text-amber-900">
          הגרף &quot;{this.props.title}&quot; לא נטען בדפדפן הזה.
        </div>
      );
    }

    return this.props.children;
  }
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <article className="metric-panel p-5">
      <div
        className="mb-4 h-2 w-20 rounded-full"
        style={{
          background: accent,
        }}
      />
      <p className="text-sm text-[#64748b]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-[#13202b]">{value}</p>
      <p className="mt-2 text-sm text-[#64748b]">{detail}</p>
    </article>
  );
}

function SourceCard({
  title,
  subtitle,
  code,
  disabled,
  onClick,
}: {
  title: string;
  subtitle: string;
  code: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`source-panel group p-7 text-right transition duration-300 ${
        disabled
          ? "source-panel--disabled cursor-not-allowed"
          : "text-[#13202b] hover:-translate-y-1.5 hover:shadow-[0_28px_90px_rgba(15,23,42,0.12)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#2563eb] via-[#0f766e] to-[#f97316]" />
      <div className="mb-10 flex items-start justify-between gap-4">
        <div className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white/70 px-3 py-1 text-xs font-semibold tracking-[0.24em] text-[#64748b]">
          {code}
        </div>
        {disabled ? (
          <span className="rounded-full bg-[rgba(148,163,184,0.18)] px-3 py-1 text-xs font-medium text-[#64748b]">
            בהמשך
          </span>
        ) : (
          <span className="rounded-full bg-[rgba(15,118,110,0.12)] px-3 py-1 text-xs font-medium text-[#0f766e]">
            זמין עכשיו
          </span>
        )}
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-4 max-w-sm text-sm leading-6 text-[#5d6b7c]">{subtitle}</p>
    </button>
  );
}

function RegionPairCard({
  config,
  monthlyPoints,
  annualPoints,
}: {
  config: SeriesPairConfig;
  monthlyPoints: NumericPoint[];
  annualPoints: NumericPoint[];
}) {
  const monthlyData: ChartData<ChartKind> = {
    labels: monthlyPoints.map((point) => point.label),
    datasets: [
      {
        label: config.monthlyLabel,
        data: monthlyPoints.map((point) => point.value),
        borderColor: config.color,
        backgroundColor: `${config.color}22`,
        pointBackgroundColor: config.color,
        pointRadius: 2.5,
        borderWidth: 2,
        fill: config.monthlyType !== "bar",
        tension: 0.32,
      },
    ],
  };

  const annualData: ChartData<ChartKind> = {
    labels: annualPoints.map((point) => point.label),
    datasets: [
      {
        label: config.annualLabel,
        data: annualPoints.map((point) => point.value),
        borderColor: config.color,
        backgroundColor: `${config.color}B3`,
        borderRadius: config.annualType === "bar" ? 12 : 0,
        borderWidth: 2,
        fill: config.annualType !== "bar",
        tension: 0.28,
      },
    ],
  };

  return (
    <article className="surface-panel p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-[#13202b]">{config.title}</h3>
          <p className="mt-1 text-sm text-[#5d6b7c]">
            מעקב כפול על אותה סדרה ברזולוציה קצרה ושנתית
          </p>
        </div>
        <span
          className="h-3 w-16 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${config.color} 0%, rgba(255,255,255,0.2) 100%)`,
          }}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartSurface
          title={config.monthlyLabel}
          subtitle="טווח חודשי / רבעוני"
          type={config.monthlyType ?? "line"}
          data={monthlyData}
        />
        <ChartSurface
          title={config.annualLabel}
          subtitle="טווח שנתי"
          type={config.annualType ?? "line"}
          data={annualData}
        />
      </div>
    </article>
  );
}

export function CbsDashboardApp() {
  const [view, setView] = useState<"home" | "cbs" | "boi">("home");
  const [summaryState, setSummaryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [regionState, setRegionState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [boiState, setBoiState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  const [boiError, setBoiError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [regionData, setRegionData] = useState<RegionDashboard | null>(null);
  const [boiSummary, setBoiSummary] = useState<BoiDashboardSummary | null>(null);
  const [selectedRegion, setSelectedRegion] = useState("סך הכל");
  const [selectedCompareRegions, setSelectedCompareRegions] = useState<string[]>(DEFAULT_COMPARE_REGIONS);
  const [topStart, setTopStart] = useState("2022-01");
  const [topEnd, setTopEnd] = useState(monthInputValue());
  const [boiStart, setBoiStart] = useState(yearsAgoMonthValue(10));
  const [boiEnd, setBoiEnd] = useState(monthInputValue());
  const [detailStart, setDetailStart] = useState("2020-01");
  const [detailEnd, setDetailEnd] = useState(monthInputValue());
  const [annualStart, setAnnualStart] = useState("2004");
  const [annualEnd, setAnnualEnd] = useState(yearValue());
  const deferredRegion = useDeferredValue(selectedRegion);

  useEffect(() => {
    if (view !== "cbs" || summaryState === "ready") {
      return;
    }

    let active = true;

    async function loadSummary() {
      setSummaryState("loading");
      setSummaryError(null);

      try {
        const payload = await fetchJson<DashboardSummary>("/api/cbs/dashboard");

        if (!active) {
          return;
        }

        setSummary(payload);
        setSelectedRegion(payload.availableRegions.includes("סך הכל") ? "סך הכל" : payload.availableRegions[0] ?? "");
        setSelectedCompareRegions(
          DEFAULT_COMPARE_REGIONS.filter((region) => payload.compareRegions.includes(region)).slice(0, 4),
        );
        setSummaryState("ready");
      } catch (error) {
        if (!active) {
          return;
        }

        setSummaryError(error instanceof Error ? error.message : "Failed to load summary");
        setSummaryState("error");
      }
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [summaryState, view]);

  useEffect(() => {
    if (view !== "boi" || boiState === "ready") {
      return;
    }

    let active = true;

    async function loadBoiSummary() {
      setBoiState("loading");
      setBoiError(null);

      try {
        const payload = await fetchJson<BoiDashboardSummary>("/api/boi/dashboard");

        if (!active) {
          return;
        }

        setBoiSummary(payload);
        setBoiState("ready");
      } catch (error) {
        if (!active) {
          return;
        }

        setBoiError(error instanceof Error ? error.message : "Failed to load BOI summary");
        setBoiState("error");
      }
    }

    void loadBoiSummary();

    return () => {
      active = false;
    };
  }, [boiState, view]);

  useEffect(() => {
    if (view !== "cbs" || summaryState !== "ready" || !deferredRegion) {
      return;
    }

    let active = true;

    async function loadRegion() {
      setRegionState("loading");
      setRegionError(null);

      try {
        const payload = await fetchJson<RegionDashboard>(`/api/cbs/region/${encodeURIComponent(deferredRegion)}`);

        if (!active) {
          return;
        }

        setRegionData(payload);
        setRegionState("ready");
      } catch (error) {
        if (!active) {
          return;
        }

        setRegionError(error instanceof Error ? error.message : "Failed to load region data");
        setRegionState("error");
      }
    }

    void loadRegion();

    return () => {
      active = false;
    };
  }, [deferredRegion, summaryState, view]);

  const activeGeneratedAt = view === "boi" ? boiSummary?.generatedAt : summary?.generatedAt;

  const summaryGeneratedLabel = activeGeneratedAt
    ? new Intl.DateTimeFormat("he-IL", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(activeGeneratedAt))
    : "";

  const topLabels = generateMonthList(topStart, topEnd);

  const priceIndexData: ChartData<ChartKind> = summary
    ? {
        labels: topLabels,
        datasets: [
          {
            label: "מדד המחירים לצרכן",
            data: alignSeries(topLabels, buildChainedIndex(summary.topSeries.cpi, topStart, topEnd)),
            borderColor: "#0891b2",
            backgroundColor: "rgba(8,145,178,0.12)",
            pointRadius: 0,
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
          },
          {
            label: "מדד מחירי הדירות",
            data: alignSeries(topLabels, buildChainedIndex(summary.topSeries.housing, topStart, topEnd)),
            borderColor: "#f97316",
            backgroundColor: "rgba(249,115,22,0.10)",
            pointRadius: 0,
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
          },
          {
            label: "מדד מחירי דירות חדשות",
            data: alignSeries(topLabels, buildChainedIndex(summary.topSeries.newDwelling, topStart, topEnd)),
            borderColor: "#ef4444",
            backgroundColor: "rgba(239,68,68,0.08)",
            pointRadius: 0,
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
          },
        ],
      }
    : { labels: [], datasets: [] };

  const comparePalette = ["#0f766e", "#2563eb", "#db2777", "#f97316", "#65a30d"];

  const regionalComparisonData: ChartData<ChartKind> = summary
    ? {
        labels: topLabels,
        datasets: selectedCompareRegions.map((region, index) => ({
          label: region,
          data: alignSeries(
            topLabels,
            buildChainedIndex(summary.regionalPrices[region] ?? [], topStart, topEnd),
          ),
          borderColor: comparePalette[index % comparePalette.length],
          backgroundColor: `${comparePalette[index % comparePalette.length]}18`,
          pointRadius: 0,
          borderWidth: 2.4,
          fill: false,
          tension: 0.28,
        })),
      }
    : { labels: [], datasets: [] };

  const filteredStock = summary ? filterByMonthRange(summary.topSeries.stock, topStart, topEnd) : [];
  const stockChartData: ChartData<ChartKind> = {
    labels: filteredStock.map((point) => point.label),
    datasets: [
      {
        label: "יתרת מלאי דירות",
        data: filteredStock.map((point) => point.value),
        borderColor: "#7c3aed",
        backgroundColor: "rgba(124,58,237,0.14)",
        pointRadius: 0,
        borderWidth: 2.5,
        fill: true,
        tension: 0.32,
      },
    ],
  };

  const latestCpi = summary?.topSeries.cpi.at(-1)?.percent ?? null;
  const latestHousing = summary?.topSeries.housing.at(-1)?.percent ?? null;
  const latestNewDwelling = summary?.topSeries.newDwelling.at(-1)?.percent ?? null;
  const latestStock = summary?.topSeries.stock.at(-1)?.value ?? null;
  const boiPalette = ["#0f766e", "#2563eb", "#ea580c", "#7c3aed", "#db2777", "#0891b2"];
  const boiSeries = boiSummary?.series ?? [];
  const filteredBoiSeries = boiSeries.map((series) => ({
    ...series,
    points: filterBoiPointsByMonthRange(series.points, boiStart, boiEnd),
  }));
  const controlClassName =
    "block w-full rounded-[18px] border border-[rgba(15,23,42,0.1)] bg-[rgba(255,255,255,0.96)] px-4 py-3 text-[#13202b] outline-none transition focus:border-[#0f766e] focus:bg-white";
  const isRefreshing =
    summaryState === "loading" || regionState === "loading" || boiState === "loading";

  function refreshAllData() {
    setSummary(null);
    setRegionData(null);
    setBoiSummary(null);
    setSummaryError(null);
    setRegionError(null);
    setBoiError(null);
    setSummaryState("idle");
    setRegionState("idle");
    setBoiState("idle");
  }

  return (
    <main className="page-shell px-4 py-6 text-[#13202b] sm:px-6 lg:px-8">
      <div className="page-orb page-orb--primary left-[-8rem] top-24 h-72 w-72" />
      <div className="page-orb page-orb--cool right-[-5rem] top-[28rem] h-80 w-80 [animation-delay:2s]" />
      <div className="mx-auto max-w-7xl">
        <section className="hero-panel fade-up px-6 py-7 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <span className="kicker font-mono text-[#e2f8f5]">מאקרו ישראל</span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-[#f8fbff] sm:text-5xl">
                נתוני מאקרו לישראל,
                <span className="block text-[#c7dde6]">בחירה מהירה בין למ״ס לבנק ישראל.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#c7dde6]">
                מסך אחד למדדים, השוואות וגרפים משני מקורות הנתונים.
              </p>
            </div>

            {view !== "home" ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full border border-[rgba(159,231,223,0.28)] bg-[rgba(15,118,110,0.16)] px-4 py-2 text-sm font-medium text-[#e2f8f5] transition hover:border-[rgba(159,231,223,0.46)] hover:bg-[rgba(15,118,110,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isRefreshing}
                  onClick={refreshAllData}
                  type="button"
                >
                  {isRefreshing ? "מרענן..." : "רענון נתונים"}
                </button>
                <button
                  className="no-print rounded-full border border-[rgba(226,232,240,0.24)] bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-medium text-[#f8fbff] transition hover:border-[rgba(226,232,240,0.46)] hover:bg-[rgba(255,255,255,0.14)]"
                  onClick={() => window.print()}
                  type="button"
                >
                  ייצוא PDF
                </button>
                <button
                  className="rounded-full border border-[rgba(226,232,240,0.24)] bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-medium text-[#f8fbff] transition hover:border-[rgba(226,232,240,0.46)] hover:bg-[rgba(255,255,255,0.14)]"
                  onClick={() => {
                    startTransition(() => setView("home"));
                  }}
                  type="button"
                >
                  חזרה למסך הבחירה
                </button>
                {summaryGeneratedLabel ? (
                  <span className="rounded-full border border-[rgba(226,232,240,0.18)] bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-medium text-[#f8fbff]">
                    עודכן: {summaryGeneratedLabel}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-[rgba(226,232,240,0.14)] bg-[rgba(255,255,255,0.08)] px-5 py-4 text-[#f8fbff]">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9fe7df]">מקורות</p>
                  <p className="mt-3 text-3xl font-semibold">2</p>
                  <p className="mt-2 text-sm text-[#c7dde6]">למ״ס ובנק ישראל.</p>
                </div>
                <div className="rounded-[20px] border border-[rgba(226,232,240,0.14)] bg-[rgba(255,255,255,0.08)] px-5 py-4 text-[#f8fbff]">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#93c5fd]">תצוגה</p>
                  <p className="mt-3 text-3xl font-semibold">פעיל</p>
                  <p className="mt-2 text-sm text-[#c7dde6]">מדדים, השוואות וניתוח אזורי.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {view === "home" ? (
          <section className="mt-8 grid gap-6 lg:grid-cols-2 fade-up delay-1">
            <SourceCard
              code="BOI"
              title="בנק ישראל"
              subtitle="ריבית, אינפלציה, שער חליפין ושוק ההון."
              onClick={() => {
                startTransition(() => setView("boi"));
              }}
            />
            <SourceCard
              code="CBS"
              title='למ"ס'
              subtitle="מחירי דיור, מלאי, מכירות ובנייה לפי אזור."
              onClick={() => {
                startTransition(() => setView("cbs"));
              }}
            />
          </section>
        ) : null}

        {view === "boi" ? (
          <section className="mt-8 space-y-8 fade-up delay-1">
            <section className="surface-panel--dark rounded-[32px] p-8 text-slate-50">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#9fe7df]">בנק ישראל</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">תמונת מצב מאקרו</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[#c7dde6]">
                מדדים מרכזיים של בנק ישראל בתצוגה אחת.
              </p>
            </section>

            {boiState === "loading" ? (
              <div className="surface-panel p-8 text-[#5d6b7c]">
                טוען נתוני בנק ישראל...
              </div>
            ) : null}

            {boiState === "error" ? (
              <div className="rounded-[32px] border border-red-200 bg-red-50 p-8 text-red-700">
                טעינת נתוני בנק ישראל נכשלה. {boiError}
              </div>
            ) : null}

            {boiState === "ready" && boiSeries.length === 0 ? (
              <div className="rounded-[32px] border border-amber-200 bg-amber-50 p-8 text-amber-900">
                אין כרגע נתונים להצגה.
              </div>
            ) : null}

            {boiState === "ready" && boiSeries.length > 0 ? (
              <>
                <section className="surface-panel p-6">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#64748b]">בנק ישראל</p>
                      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#13202b]">טווח תצוגה</h2>
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5d6b7c]">
                        בחירת תאריכים אחת לכל כרטיסי המדדים והגרפים בדשבורד של בנק ישראל.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-medium text-[#5d6b7c]">
                        התחלה
                        <input
                          className={`mt-2 ${controlClassName}`}
                          max={boiEnd}
                          onChange={(event) => setBoiStart(event.target.value)}
                          type="month"
                          value={boiStart}
                        />
                      </label>
                      <label className="text-sm font-medium text-[#5d6b7c]">
                        סיום
                        <input
                          className={`mt-2 ${controlClassName}`}
                          min={boiStart}
                          onChange={(event) => setBoiEnd(event.target.value)}
                          type="month"
                          value={boiEnd}
                        />
                      </label>
                    </div>
                  </div>
                </section>

                <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  {filteredBoiSeries.slice(0, 4).map((series, index) => {
                    const latestValue = series.points.at(-1)?.value ?? null;

                    return (
                      <MetricCard
                        key={series.key}
                        label={series.label}
                        value={boiMetricValue(latestValue, series.unit)}
                        detail={boiSeriesDetail(series)}
                        accent={`linear-gradient(90deg, ${boiPalette[index % boiPalette.length]}, rgba(255,255,255,0.3))`}
                      />
                    );
                  })}
                </section>

                {BOI_SECTION_CONFIG.map((section) => {
                  const sectionSeries = section.keys
                    .map((key) => filteredBoiSeries.find((s) => s.key === key))
                    .filter((s): s is BoiSeries => s != null);

                  if (sectionSeries.length === 0) {
                    return null;
                  }

                  // Keep even count so the 2-col grid never has an orphan chart
                  const evenSeries =
                    sectionSeries.length % 2 !== 0 ? sectionSeries.slice(0, -1) : sectionSeries;

                  return (
                    <section key={section.title} className="space-y-5">
                      <h3 className="text-2xl font-semibold text-[#13202b]">{section.title}</h3>
                      <div className="grid gap-5 xl:grid-cols-2">
                        {evenSeries.map((series, index) => (
                          <ChartSurface
                            key={series.key}
                            title={series.label}
                            subtitle={boiSeriesDetail(series)}
                            type="line"
                            data={{
                              labels: series.points.map((point) => point.label),
                              datasets: [
                                {
                                  label: series.label,
                                  data: series.points.map((point) => point.value),
                                  borderColor: boiPalette[index % boiPalette.length],
                                  backgroundColor: `${boiPalette[index % boiPalette.length]}22`,
                                  pointRadius: 0,
                                  borderWidth: 2.5,
                                  fill: true,
                                  tension: 0.28,
                                },
                              ],
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </>
            ) : null}

            <section className="surface-panel p-6 text-sm leading-7 text-[#5d6b7c]">
              סדרות מאקרו נבחרות מבנק ישראל.
            </section>
          </section>
        ) : null}

        {view === "cbs" ? (
          <section className="mt-8 space-y-8 fade-up delay-1">
            {summaryState === "loading" ? (
              <div className="surface-panel p-8 text-[#5d6b7c]">
                טוען נתוני למ״ס...
              </div>
            ) : null}

            {summaryState === "error" ? (
              <div className="rounded-[32px] border border-red-200 bg-red-50 p-8 text-red-700">
                טעינת נתוני למ״ס נכשלה. {summaryError}
              </div>
            ) : null}

            {summaryState === "ready" && summary ? (
              <>
                <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="שינוי אחרון במדד המחירים לצרכן"
                    value={latestNumberLabel(latestCpi, "%")}
                    detail="הנקודה האחרונה בסדרת המדד"
                    accent="linear-gradient(90deg,#0891b2,#67e8f9)"
                  />
                  <MetricCard
                    label="שינוי אחרון במדד מחירי הדירות"
                    value={latestNumberLabel(latestHousing, "%")}
                    detail="לפי למ״ס"
                    accent="linear-gradient(90deg,#f97316,#fdba74)"
                  />
                  <MetricCard
                    label="שינוי אחרון במדד דירות חדשות"
                    value={latestNumberLabel(latestNewDwelling, "%")}
                    detail="מחושב מהטבלה הפנימית של למ״ס"
                    accent="linear-gradient(90deg,#ef4444,#fca5a5)"
                  />
                  <MetricCard
                    label="יתרת מלאי דירות"
                    value={latestCompactLabel(latestStock)}
                    detail="יתרה לסוף התקופה"
                    accent="linear-gradient(90deg,#7c3aed,#c4b5fd)"
                  />
                </section>

                <section className="surface-panel p-6">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#64748b]">למ״ס</p>
                      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#13202b]">שוק הדיור</h2>
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5d6b7c]">
                        מדדי על והשוואות אזוריות במסך אחד.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-medium text-[#5d6b7c]">
                        התחלה
                        <input
                          className={`mt-2 ${controlClassName}`}
                          onChange={(event) => setTopStart(event.target.value)}
                          type="month"
                          value={topStart}
                        />
                      </label>
                      <label className="text-sm font-medium text-[#5d6b7c]">
                        סיום
                        <input
                          className={`mt-2 ${controlClassName}`}
                          onChange={(event) => setTopEnd(event.target.value)}
                          type="month"
                          value={topEnd}
                        />
                      </label>
                    </div>
                  </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
                  <ChartSurface
                    title="מדדי מחירים משורשרים"
                    subtitle="אינדקס בסיס 100 בטווח הזמן שנבחר"
                    type="line"
                    data={priceIndexData}
                  />
                  <ChartSurface
                    title="יתרת מלאי דירות"
                    subtitle="ערכי הסדרה בפועל"
                    type="line"
                    data={stockChartData}
                  />
                </section>

                <section className="surface-panel p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-[#13202b]">השוואת מחירי דירות לפי אזור</h2>
                      <p className="mt-2 text-sm text-[#5d6b7c]">
                        בחר עד ארבעה אזורים כדי להצליב את האינדקסים על אותו גרף.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {summary.compareRegions.map((region) => {
                        const selected = selectedCompareRegions.includes(region);
                        const canAdd = selected || selectedCompareRegions.length < 4;

                        return (
                          <button
                            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                              selected
                                ? "bg-[#0f172a] text-[#f8fbff]"
                                : canAdd
                                  ? "bg-[rgba(15,23,42,0.06)] text-[#5d6b7c] hover:bg-[rgba(15,23,42,0.1)]"
                                  : "cursor-not-allowed bg-[rgba(15,23,42,0.06)] text-[rgba(93,107,124,0.4)]"
                            }`}
                            disabled={!selected && !canAdd}
                            key={region}
                            onClick={() => {
                              setSelectedCompareRegions((current) => {
                                if (current.includes(region)) {
                                  return current.filter((item) => item !== region);
                                }

                                if (current.length >= 4) {
                                  return current;
                                }

                                return [...current, region];
                              });
                            }}
                            type="button"
                          >
                            {region}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-6">
                    <ChartSurface
                      title="מדד מחירי דירות אזורי"
                      subtitle="אותו טווח, אזורים שונים"
                      type="line"
                      data={regionalComparisonData}
                    />
                  </div>
                </section>

                <section className="surface-panel p-6">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#64748b]">אזור</p>
                      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#13202b]">נתונים לפי אזור</h2>
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5d6b7c]">
                        מכירות, בנייה והתחדשות עירונית לפי האזור שנבחר.
                      </p>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-3">
                      <label className="text-sm font-medium text-[#5d6b7c]">
                        אזור
                        <select
                          className={`mt-2 ${controlClassName}`}
                          onChange={(event) => {
                            startTransition(() => setSelectedRegion(event.target.value));
                          }}
                          value={selectedRegion}
                        >
                          {summary.availableRegions.map((region) => (
                            <option key={region} value={region}>
                              {region}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-medium text-[#5d6b7c]">
                        טווח חודשי / רבעוני
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          <input
                            className={controlClassName}
                            onChange={(event) => setDetailStart(event.target.value)}
                            type="month"
                            value={detailStart}
                          />
                          <input
                            className={controlClassName}
                            onChange={(event) => setDetailEnd(event.target.value)}
                            type="month"
                            value={detailEnd}
                          />
                        </div>
                      </label>
                      <label className="text-sm font-medium text-[#5d6b7c]">
                        טווח שנתי
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          <input
                            className={controlClassName}
                            min="1990"
                            onChange={(event) => setAnnualStart(event.target.value)}
                            type="number"
                            value={annualStart}
                          />
                          <input
                            className={controlClassName}
                            min="1990"
                            onChange={(event) => setAnnualEnd(event.target.value)}
                            type="number"
                            value={annualEnd}
                          />
                        </div>
                      </label>
                    </div>
                  </div>
                </section>

                {regionState === "loading" ? (
                  <div className="surface-panel p-8 text-[#5d6b7c]">
                    טוען נתוני אזור עבור {selectedRegion}...
                  </div>
                ) : null}

                {regionState === "error" ? (
                  <div className="rounded-[32px] border border-red-200 bg-red-50 p-8 text-red-700">
                    טעינת האזור נכשלה. {regionError}
                  </div>
                ) : null}

                {regionState === "ready" && regionData ? (
                  <div className="space-y-8">
                    {REGION_SECTIONS.map((section) => (
                      <section key={section.title} className="space-y-5">
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="text-2xl font-semibold text-[#13202b]">{section.title}</h3>
                          <p className="text-sm text-[#5d6b7c]">{regionData.region}</p>
                        </div>

                        <div className="grid gap-6">
                          {section.items.map((config) => (
                            <RegionPairCard
                              annualPoints={filterByYearRange(regionData.series[config.annualKey] ?? [], annualStart, annualEnd)}
                              config={config}
                              key={config.monthlyKey}
                              monthlyPoints={filterByMonthRange(
                                regionData.series[config.monthlyKey] ?? [],
                                detailStart,
                                detailEnd,
                              )}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : null}

                <footer className="pb-8 text-sm text-[#5d6b7c]">
                  למ״ס ובנק ישראל במסך אחד.
                </footer>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
