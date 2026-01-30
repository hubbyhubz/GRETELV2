import * as XLSX from 'xlsx';
import type { OKRMetricType, OKRTargetOperator, OKRTrackingStatus } from '../okrTypes';

export type ExcelKrRow = {
  objective_component: string;
  objective_title: string;
  objective_description: string;
  objective_weightage: number | null;

  kr_title: string;
  metric: string;
  target_operator: OKRTargetOperator;
  target_value: number | null;
  kr_weight: number | null;
  initiatives: string;
  start_date: string | null;
  end_date: string | null;
  tracking_status: OKRTrackingStatus;
  achieved_value: number | null;
  metric_type: OKRMetricType;
  data_source: string;
  budget_target_value: number | null;
  stretch_target_value: number | null;
};

const norm = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();

function sanitizeExcelString(value: string): string {
  const raw = String(value ?? '');
  const trimmedLeft = raw.replace(/^[\u0000-\u0020]+/g, '');
  if (!trimmedLeft) return raw;
  const first = trimmedLeft[0];
  if (first === '=' || first === '+' || first === '-' || first === '@') return `'${raw}`;
  return raw;
}

function sanitizeExcelCell(value: any): any {
  if (typeof value !== 'string') return value;
  return sanitizeExcelString(value);
}

const normHeader = (v: any) =>
  norm(v)
    .toLowerCase()
    .replace(/[%()]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');

const asNumberOrNull = (v: any) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const excelDateToIso = (v: any) => {
  if (!v) return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const y = String(d.y).padStart(4, '0');
    const m = String(d.m).padStart(2, '0');
    const day = String(d.d).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = norm(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('-');
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const mapOperator = (v: any): OKRTargetOperator => {
  const s = norm(v).toLowerCase();
  if (s.includes('greater') || s.includes('>=') || s.includes('at least')) return 'gte';
  if (s.includes('less') || s.includes('<=') || s.includes('at most')) return 'lte';
  return 'equal_to';
};

const mapStatus = (v: any): OKRTrackingStatus => {
  const s = norm(v).toLowerCase();
  if (s.includes('complete')) return 'completed';
  if (s.includes('on track')) return 'on_track';
  if (s.includes('at risk')) return 'at_risk';
  if (s.includes('off track')) return 'off_track';
  if (s.includes('start')) return 'started';
  return 'not_started';
};

const guessMetricType = (metric: string, targetValue: number | null): OKRMetricType => {
  const m = metric.toLowerCase();
  if (m.includes('%') || m.includes('percent') || (targetValue != null && targetValue > 0 && targetValue <= 1)) return 'percent';
  if (m.includes('php') || m.includes('$') || m.includes('currency') || m.includes('revenue') || m.includes('cost')) return 'currency';
  if (m.includes('count') || m.includes('no') || m.includes('ins') || m.includes('attendance')) return 'count';
  if (m.includes('completion')) return 'percent';
  return 'number';
};

function findHeaderRow(rows: any[][]) {
  const wanted = [
    'objective component',
    'objective title',
    'objective description',
    'objective weight',
    'objective weightage',
    'key result title',
    'metric',
    'target type',
    'target types',
    'target',
    'kr weight',
    'kr weightage',
    'initiatives',
    'kr start date',
    'start date',
    'kr end date',
    'end date',
    'kr status',
    'achieved',
    'data source',
    'productivity tool',
  ];
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i] || [];
    const headers = row.map(normHeader);
    let score = 0;
    headers.forEach((h) => {
      if (!h) return;
      if (wanted.some((w) => h.includes(w))) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function buildIndex(headerRow: any[]) {
  const idx: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    const key = normHeader(h);
    if (!key) return;
    idx[key] = i;
  });

  const find = (...keys: string[]) => {
    for (const k of keys) {
      const kk = normHeader(k);
      const direct = idx[kk];
      if (typeof direct === 'number') return direct;
      const found = Object.keys(idx).find((x) => x.includes(kk));
      if (found) return idx[found];
    }
    return -1;
  };

  return {
    objective_component: find('objective component'),
    objective_title: find('objective title', 'objective'),
    objective_description: find('objective description'),
    objective_weightage: find('objective weight %', 'objective weightage', 'weightage %', 'weight'),
    kr_title: find('key result title', 'key result', 'kr'),
    metric: find('metric'),
    target_operator: find('target type', 'target types'),
    target_value: find('target'),
    kr_weight: find('kr weight %', 'kr weightage', 'stretch weight', 'weight'),
    initiatives: find('initiatives', 'initiative'),
    start_date: find('kr start date', 'start date'),
    end_date: find('kr end date', 'end date'),
    status: find('kr status', 'status'),
    achieved: find('achieved'),
    data_source: find('data source', 'productivity tool'),
    budget_target_value: find('budget', 'budget target'),
    stretch_target_value: find('stretch', 'stretch target'),
  };
}

export function inspectGoalPlanWorkbook(arrayBuffer: ArrayBuffer): {
  sheetNames: string[];
  candidateSheets: string[];
} {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const hiddenByName = new Set<string>();
  const workbookSheets: any[] = (wb as any)?.Workbook?.Sheets || [];
  workbookSheets.forEach((s) => {
    const name = String(s?.name || '').trim();
    const hidden = Number(s?.Hidden || 0);
    if (name && hidden) hiddenByName.add(name);
  });
  const candidateSheets: string[] = [];
  wb.SheetNames.forEach((sheetName) => {
    if (hiddenByName.has(sheetName)) return;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    const headerIdx = findHeaderRow(rows);
    if (headerIdx >= 0) candidateSheets.push(sheetName);
  });
  return { sheetNames: wb.SheetNames.filter((n) => !hiddenByName.has(n)), candidateSheets };
}

export function parseGoalPlanWorkbook(arrayBuffer: ArrayBuffer, options?: { includeSheets?: string[] }): ExcelKrRow[] {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const out: ExcelKrRow[] = [];
  const include = options?.includeSheets?.length ? new Set(options.includeSheets) : null;
  const hiddenByName = new Set<string>();
  const workbookSheets: any[] = (wb as any)?.Workbook?.Sheets || [];
  workbookSheets.forEach((s) => {
    const name = String(s?.name || '').trim();
    const hidden = Number(s?.Hidden || 0);
    if (name && hidden) hiddenByName.add(name);
  });

  wb.SheetNames.forEach((sheetName) => {
    if (hiddenByName.has(sheetName)) return;
    if (include && !include.has(sheetName)) return;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) return;
    const headerRow = rows[headerIdx] || [];
    const ix = buildIndex(headerRow);

    let currentObjectiveTitle = '';
    let currentComponent = '';
    let currentObjectiveDesc = '';
    let currentObjectiveWeight: number | null = null;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const objectiveTitle = ix.objective_title >= 0 ? norm(row[ix.objective_title]) : '';
      const component = ix.objective_component >= 0 ? norm(row[ix.objective_component]) : '';
      const desc = ix.objective_description >= 0 ? norm(row[ix.objective_description]) : '';
      const objWeight = ix.objective_weightage >= 0 ? asNumberOrNull(row[ix.objective_weightage]) : null;
      if (objectiveTitle) currentObjectiveTitle = objectiveTitle;
      if (component) currentComponent = component;
      if (desc) currentObjectiveDesc = desc;
      if (objWeight != null) currentObjectiveWeight = objWeight;

      const krTitle = ix.kr_title >= 0 ? norm(row[ix.kr_title]) : '';
      if (!currentObjectiveTitle || !krTitle) continue;

      const metric = ix.metric >= 0 ? norm(row[ix.metric]) : '';
      const op = ix.target_operator >= 0 ? mapOperator(row[ix.target_operator]) : 'equal_to';
      const target = ix.target_value >= 0 ? asNumberOrNull(row[ix.target_value]) : null;
      const achieved = ix.achieved >= 0 ? asNumberOrNull(row[ix.achieved]) : null;
      const krWeight = ix.kr_weight >= 0 ? asNumberOrNull(row[ix.kr_weight]) : null;
      const initiatives = ix.initiatives >= 0 ? norm(row[ix.initiatives]) : '';
      const startDate = ix.start_date >= 0 ? excelDateToIso(row[ix.start_date]) : null;
      const endDate = ix.end_date >= 0 ? excelDateToIso(row[ix.end_date]) : null;
      const status = ix.status >= 0 ? mapStatus(row[ix.status]) : 'not_started';
      const dataSource = ix.data_source >= 0 ? norm(row[ix.data_source]) : '';
      const budgetTarget = ix.budget_target_value >= 0 ? asNumberOrNull(row[ix.budget_target_value]) : null;
      const stretchTarget = ix.stretch_target_value >= 0 ? asNumberOrNull(row[ix.stretch_target_value]) : null;

      out.push({
        objective_component: currentComponent,
        objective_title: currentObjectiveTitle,
        objective_description: currentObjectiveDesc,
        objective_weightage: currentObjectiveWeight,
        kr_title: krTitle,
        metric,
        target_operator: op,
        target_value: target,
        kr_weight: krWeight,
        initiatives,
        start_date: startDate,
        end_date: endDate,
        tracking_status: status,
        achieved_value: achieved,
        metric_type: guessMetricType(metric, target),
        data_source: dataSource,
        budget_target_value: budgetTarget,
        stretch_target_value: stretchTarget,
      });
    }
  });

  return out;
}

export function buildGoalPlanWorkbook(params: {
  sheetName: string;
  rows: ExcelKrRow[];
}): ArrayBuffer {
  const { sheetName, rows } = params;
  const header = [
    'Objective Component',
    'Objective Title',
    'Objective Description',
    'Objective Weight %',
    'Key Result Title',
    'Metric',
    'Target Type',
    'Target',
    'KR Weight %',
    'Initiatives',
    'KR Start Date',
    'KR End Date',
    'KR Status',
    'Achieved',
    'Data Source',
    'Budget Target',
    'Stretch Target',
  ];

  const aoa: any[][] = [header];
  rows.forEach((r) => {
    aoa.push([
      sanitizeExcelCell(r.objective_component),
      sanitizeExcelCell(r.objective_title),
      sanitizeExcelCell(r.objective_description),
      r.objective_weightage ?? '',
      sanitizeExcelCell(r.kr_title),
      sanitizeExcelCell(r.metric),
      sanitizeExcelCell(r.target_operator),
      r.target_value ?? '',
      r.kr_weight ?? '',
      sanitizeExcelCell(r.initiatives),
      r.start_date ?? '',
      r.end_date ?? '',
      sanitizeExcelCell(r.tracking_status),
      r.achieved_value ?? '',
      sanitizeExcelCell(r.data_source),
      r.budget_target_value ?? '',
      r.stretch_target_value ?? '',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Goal Plan');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}
