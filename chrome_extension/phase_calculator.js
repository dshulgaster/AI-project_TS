'use strict';

const PHASES = ['po', 'oa', 'dev', 'accept', 'stab'];

const CATEGORY_RULES = [
  { key: 'bugfix', match: /исправлен|ошибк|дефект|замечани/, defaultPhase: 'dev' },
  { key: 'constructor', match: /конструктор/, defaultPhase: 'po' },
  { key: 'analyst', match: /аналитик|анализ доработки/, defaultPhase: 'po' },
  { key: 'planning', match: /организац|планирован|официальный ответ|оценка|методик/, defaultPhase: 'oa' },
  { key: 'consultation', match: /консультац/, defaultPhase: 'dev' },
  { key: 'dev', match: /разработк/, defaultPhase: 'dev' },
  { key: 'qa', match: /тестирован|испытан|обеспечения качества/, defaultPhase: 'dev' },
  { key: 'deploy', match: /тираж|сборк|дистрибутив/, defaultPhase: 'dev' },
  { key: 'doc', match: /документаци/, defaultPhase: 'dev' },
  { key: 'accept', match: /при[её]мк/, defaultPhase: 'accept' },
  { key: 'stab', match: /внедрени|стабилизац|сопровождение опэ/, defaultPhase: 'stab' },
  { key: 'management', match: /управленческ|управляющ|управление/, defaultPhase: 'dev' }
];

function asDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (parsed.getUTCFullYear() === Number(match[1]) && parsed.getUTCMonth() === Number(match[2]) - 1 && parsed.getUTCDate() === Number(match[3])) return parsed;
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateState(value) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return 'missing';
  return asDate(value) ? 'valid' : 'malformed';
}

function milestoneDate(milestones, operationNames, objectNames) {
  if (!milestones) return null;
  if (!Array.isArray(milestones)) {
    for (const name of objectNames) {
      const value = milestones[name];
      const parsed = asDate(value && value.date ? value.date : value);
      if (parsed) return parsed;
    }
    return null;
  }
  const item = milestones.find((milestone) => {
    const operation = String(milestone.operation || milestone.name || '').toLowerCase();
    return operationNames.some((name) => operation.includes(name));
  });
  return item ? asDate(item.date || item.dateStr || item.value) : null;
}

function getMilestones(requestMilestones) {
  return {
    po: milestoneDate(requestMilestones, ['предвар', 'согласовать предвар', 'по'], ['effectivePoBoundaryDateObj', 'poBoundary', 'poBoundaryDate']),
    dev: milestoneDate(requestMilestones, ['передать в разработку', 'разработку'], ['dateDevStartObj', 'devStart', 'devStartDate']),
    accept: milestoneDate(requestMilestones, ['передать на приемку', 'готовность к приемке', 'приемку'], ['dateAcceptanceStartObj', 'acceptStart', 'acceptStartDate']),
    release: milestoneDate(requestMilestones, ['сдать в опэ', 'внедрение', 'релиз'], ['dateReleaseObj', 'release', 'releaseDate']),
    start: milestoneDate(requestMilestones, ['создан', 'регистрац'], ['createdAt', 'start', 'startDate'])
  };
}

function categoryDefaultPhase(category) {
  if (category.defaultPhase) return category.defaultPhase;
  const text = String(category.name || category.key || '').toLowerCase();
  const rule = CATEGORY_RULES.find((candidate) => candidate.match.test(text));
  return rule ? rule.defaultPhase : 'dev';
}

function resolvePhase(worklog, category, milestones) {
  const value = worklog && (worklog.date !== undefined ? worklog.date : worklog.loggedAt !== undefined ? worklog.loggedAt : worklog.worklogDate);
  const state = dateState(value);
  if (state === 'missing') return categoryDefaultPhase(category || {});
  if (state === 'malformed') return null;
  const date = asDate(value);
  const points = getMilestones(milestones);
  if (points.release && date > points.release) return 'stab';
  if (points.accept && date > points.accept) return 'accept';
  if (points.dev && date > points.dev) return 'dev';
  if (points.po && date > points.po) return 'oa';
  return 'po';
}

function toDays(value, hoursPerDay) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.replace(',', '.');
  const hours = Number(normalized);
  return Number.isFinite(hours) ? hours / hoursPerDay : null;
}

function contributionDays(item, hoursPerDay) {
  if (!item) return null;
  if (item.factDays !== undefined) return toDays(item.factDays, 1);
  if (item.days !== undefined) return toDays(item.days, 1);
  if (item.hours !== undefined) {
    const hours = typeof item.hours === 'number' ? item.hours : Number(String(item.hours).replace(',', '.'));
    return Number.isFinite(hours) ? hours / hoursPerDay : null;
  }
  if (item.value !== undefined) return toDays(item.value, 1);
  return null;
}

function warningText(warning) {
  return typeof warning === 'string' ? warning : String(warning && (warning.message || warning.code) || 'warning');
}

function emptyResult(source, settings) {
  const points = getMilestones(source.milestones);
  return {
    phases: { po: {}, oa: {}, dev: {}, accept: {}, stab: {} },
    totals: { plan: 0, fact: 0, variance: 0 },
    variances: { po: 0, oa: 0, dev: 0, accept: 0, stab: 0 },
    sourceQuality: 'error',
    poSla: calculateSla(source, points, settings.slaDays),
    warnings: Array.isArray(source.warnings) ? source.warnings.slice() : [],
    trace: { excludedParents: [], fallbacks: [] }
  };
}

function calculatePlanFact(request, options) {
  const source = request || {};
  const settings = Object.assign({ hoursPerDay: 8, slaDays: 5 }, options || {});
  const categories = Array.isArray(source.categories) ? source.categories : [];
  if (!categories.length) {
    return emptyResult(source, settings);
  }

  const points = getMilestones(source.milestones);
  const warnings = Array.isArray(source.warnings) ? source.warnings.slice() : [];
  const trace = { excludedParents: [], fallbacks: [] };
  const data = Object.fromEntries(PHASES.map((phase) => [phase, { plan: 0, fact: 0, variance: 0, details: {} }]));
  let malformed = 0;
  let fallbackUsed = false;

  categories.forEach((category, categoryIndex) => {
    if (!category || typeof category !== 'object') {
      malformed++;
      return;
    }
    const key = category.key || category.name || `category-${categoryIndex}`;
    const categoryPhase = categoryDefaultPhase(category);
    const worklogs = Array.isArray(category.worklogs) ? category.worklogs : [];
    const children = worklogs.filter((worklog) => worklog && (worklog.source === 'child-row' || worklog.type === 'child' || worklog.taskId));
    const aggregates = worklogs.filter((worklog) => worklog && (worklog.source === 'aggregated-group' || worklog.type === 'parent' || !worklog.taskId));
    const parentDays = contributionDays(category, settings.hoursPerDay) ?? (aggregates.length ? contributionDays(aggregates[0], settings.hoursPerDay) : null);
    const selected = children.length ? children : (aggregates.length ? aggregates : [{ days: parentDays }]);
    if (children.length && parentDays !== null) trace.excludedParents.push({ category: key, days: parentDays });

    selected.forEach((worklog) => {
      const days = contributionDays(worklog, settings.hoursPerDay);
      if (days === null || days < 0) {
        malformed++;
        return;
      }
      const dateValue = worklog.date !== undefined ? worklog.date : worklog.loggedAt !== undefined ? worklog.loggedAt : worklog.worklogDate;
      const dateStatus = dateState(dateValue);
      if (dateStatus === 'malformed') {
        malformed++;
        return;
      }
      const phase = resolvePhase(worklog, category, source.milestones);
      if (dateStatus === 'missing') {
        fallbackUsed = true;
        trace.fallbacks.push({ category: key, defaultPhase: categoryPhase });
      }
      data[phase].fact += days;
      data[phase].details[key] = (data[phase].details[key] || 0) + days;
    });

    const plan = category.planDays !== undefined ? category.planDays : category.planHours !== undefined ? Number(category.planHours) / settings.hoursPerDay : category.plan;
    if (plan !== undefined && plan !== null && Number.isFinite(Number(plan))) data[categoryPhase].plan += Number(plan);
  });

  PHASES.forEach((phase) => { data[phase].variance = data[phase].fact - data[phase].plan; });
  const totals = PHASES.reduce((result, phase) => {
    result.plan += data[phase].plan;
    result.fact += data[phase].fact;
    return result;
  }, { plan: 0, fact: 0, variance: 0 });
  totals.variance = totals.fact - totals.plan;
  const variances = Object.fromEntries(PHASES.map((phase) => [phase, data[phase].variance]));
  const poSla = calculateSla(source, points, settings.slaDays);
  const missingMilestones = !points.po || !points.dev || !points.accept || !points.release;
  if (missingMilestones) warnings.push('missing milestones');
  if (fallbackUsed) warnings.push('defaultPhase fallback used');
  if (malformed) warnings.push(`${malformed} malformed row(s)`);
  const sourceQuality = ['ready', 'partial', 'warning', 'error'].includes(source.sourceQuality) ? source.sourceQuality : null;
  let quality = 'ready';
  if (sourceQuality === 'error') quality = 'error';
  else if (malformed || sourceQuality === 'warning' || warnings.some((warning) => warningText(warning).includes('expansion'))) quality = 'warning';
  else if (fallbackUsed || missingMilestones || sourceQuality === 'partial') quality = 'partial';
  return { phases: data, totals, variances, sourceQuality: quality, poSla, warnings, trace };
}

function calculateSla(source, points, slaDays) {
  const explicitDuration = Number(source.preliminaryAnalysisDays || source.poDurationDays);
  let durationDays = Number.isFinite(explicitDuration) && explicitDuration ? explicitDuration : null;
  const start = points.start || asDate(source.taskCreatedAt || source.createdAt);
  if (durationDays === null && start && points.po) durationDays = (points.po - start) / 86400000;
  if (durationDays === null) return { status: 'ok', durationDays: null, slaDays };
  return { status: durationDays > slaDays ? 'danger' : 'ok', durationDays, slaDays };
}

module.exports = { calculatePlanFact, resolvePhase };