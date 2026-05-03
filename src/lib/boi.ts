import { BOI_SERIES_DEFINITIONS, type BoiSeriesDefinition } from "@/lib/boi-catalog";
import { withWeeklyBlobArtifacts } from "@/lib/blob-cache";
import { toCsv, type SourceTableRow } from "@/lib/source-table";
import type { BoiDashboardSummary, BoiPoint, BoiSeries } from "@/lib/boi-types";

const DEFAULT_TIMEOUT_MS = 30_000;
const BOI_SDMX_API = "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2";

const dimensionCountCache = new Map<string, Promise<number>>();

function labelFromDate(date: string) {
  if (/^\d{4}-\d{2}$/.test(date)) {
    return `${date.slice(5, 7)}-${date.slice(0, 4)}`;
  }

  if (/^\d{4}-Q[1-4]$/.test(date)) {
    return `${date.slice(5)}-${date.slice(0, 4)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Intl.DateTimeFormat("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(`${date}T00:00:00Z`));
  }

  return date;
}

function wildcardKey(seriesCode: string, dimensionCount: number) {
  return seriesCode + ".".repeat(Math.max(0, dimensionCount - 1));
}

function parseXmlAttributes(source: string) {
  const attributes = new Map<string, string>();
  const attributePattern = /([A-Z0-9_]+)="([^"]*)"/g;

  for (const match of source.matchAll(attributePattern)) {
    const [, key, value] = match;
    attributes.set(key, value);
  }

  return attributes;
}

function parseSdmxSeries(xml: string) {
  const seriesMatch = xml.match(/<Series\b([^>]*)>/);

  if (!seriesMatch) {
    return null;
  }

  const attributes = parseXmlAttributes(seriesMatch[1]);
  const points: BoiPoint[] = [];
  const obsPattern = /<Obs\b[^>]*TIME_PERIOD="([^"]+)"[^>]*OBS_VALUE="([^"]+)"/g;

  for (const match of xml.matchAll(obsPattern)) {
    const [, date, rawValue] = match;
    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      continue;
    }

    points.push({
      date,
      label: labelFromDate(date),
      value,
    });
  }

  return {
    attributes,
    points,
  };
}

function aggregateMonthEnd(points: BoiPoint[]) {
  const byMonth = new Map<string, BoiPoint>();

  for (const point of points) {
    const monthKey = point.date.slice(0, 7);
    const existing = byMonth.get(monthKey);

    if (!existing || point.date > existing.date) {
      byMonth.set(monthKey, {
        ...point,
        date: monthKey,
        label: labelFromDate(monthKey),
      });
    }
  }

  return Array.from(byMonth.values()).sort((left, right) => left.date.localeCompare(right.date));
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`BOI request failed: ${response.status}`);
  }

  return response.text();
}

async function getDimensionCount(definition: Extract<BoiSeriesDefinition, { kind: "sdmx" }>) {
  const structureId = definition.structureId ?? definition.dataflowId;
  const cacheKey = `${definition.agencyId}:${structureId}:${definition.version}`;
  const existing = dimensionCountCache.get(cacheKey);

  if (existing) {
    return existing;
  }

  const nextLoad = (async () => {
    const xml = await fetchText(
      `${BOI_SDMX_API}/datastructure/${definition.agencyId}/${structureId}/${definition.version}`,
    );
    const dimensions = new Set<string>();
    const dimensionPattern = /<str:Dimension\b[^>]*id="([A-Z0-9_]+)"[^>]*position="([0-9]+)"/g;

    for (const match of xml.matchAll(dimensionPattern)) {
      const [, id] = match;

      if (id !== "TIME_PERIOD") {
        dimensions.add(id);
      }
    }

    if (dimensions.size === 0) {
      throw new Error(`Could not resolve BOI dimensions for ${cacheKey}`);
    }

    return dimensions.size;
  })();

  dimensionCountCache.set(cacheKey, nextLoad);
  nextLoad.catch(() => dimensionCountCache.delete(cacheKey));
  return nextLoad;
}

async function fetchSdmxSeries(definition: Extract<BoiSeriesDefinition, { kind: "sdmx" }>): Promise<BoiSeries> {
  const key = definition.queryKey ?? definition.seriesCode;
  const xml = await fetchText(
    `${BOI_SDMX_API}/data/dataflow/${definition.agencyId}/${definition.dataflowId}/${definition.version}/${key}?startperiod=${definition.startPeriod}`,
  );
  const parsed = parseSdmxSeries(xml);

  if (!parsed) {
    throw new Error(`BOI series returned no data: ${definition.seriesCode}`);
  }

  let points = parsed.points.map((point) => ({
    ...point,
    value: definition.transform ? definition.transform(point.value) : point.value,
  }));

  if (definition.aggregate === "month-end") {
    points = aggregateMonthEnd(points);
  }

  return {
    key: definition.key,
    label: definition.label,
    unit: definition.unit,
    category: definition.category,
    points,
  };
}

async function fetchBoiDashboardSummaryFresh(): Promise<BoiDashboardSummary> {
  const results = await Promise.allSettled(BOI_SERIES_DEFINITIONS.map((definition) => fetchSdmxSeries(definition)));
  const series = results
    .filter((r): r is PromiseFulfilledResult<BoiSeries> => r.status === "fulfilled")
    .map((r) => r.value);

  return {
    title: "BOI Macro Watchlist",
    generatedAt: new Date().toISOString(),
    series: series.filter((item) => item.points.length > 0),
  };
}

export async function fetchBoiDashboardSummary(): Promise<BoiDashboardSummary> {
  return withWeeklyBlobArtifacts("boi-source-v3", async () => {
    const value = await fetchBoiDashboardSummaryFresh();
    const rows: SourceTableRow[] = value.series.flatMap((series) =>
      series.points.map((point) => ({
        source: "boi",
        series_key: series.key,
        series_label: series.label,
        observation_date: point.date,
        value: point.value,
        change: null,
        unit: series.unit,
        category: series.category,
        region: null,
        base: null,
        is_partial: false,
      })),
    );

    return {
      value,
      csv: toCsv(rows),
    };
  });
}
