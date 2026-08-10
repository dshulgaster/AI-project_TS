// TrackStudio CyberOS Helper - Content Script («П-Ф по запросу» v7.6.0 - Child Subtask Level Precise Interval Allocator)
(function () {
  'use strict';

  function isTaskPage() {
    return window.location.href.toLowerCase().includes('/task/') || window.location.href.toLowerCase().includes('task_id=');
  }

  console.log('🚀 CyberOS TrackStudio Helper v7.6.0 (Child Subtask Level Precise Interval Allocator) loaded!');

  let isVisible = false; // ПО УМОЛЧАНИЮ ВЫКЛЮЧЕН (включается вручную по кнопке в панели расширений)
  let currentUnit = 'days';
  let currentWindowSize = 'max'; // ПО УМОЛЧАНИЮ В РАЗВЕРНУТОМ ПО ШИРИНЕ ВИДЕ (540px)
  let isDetailedView = false;
  let activeTab = 'hours';

  let taskData = {
    id: '',
    category: '',
    status: '',
    assignee: '',
    stageCode: 'S1',
    stageTitle: 'S1: ПО - Подготовка',
    stageDesc: 'ПО не передавалось в банк. Следующий шаг — передача предварительного решения.',
    isDirectTrack: false,
    tsHeaderSummaryDays: null,
    
    // SLA & Timeline Metrics
    stateChangeDateStr: '-',
    stateChangeDateObj: null,
    timeOnLastRoleDays: 0,
    timelineColvirDays: 0,
    poDaysElapsed: 0,
    poSlaStatus: 'ok',
    poSlaBadgeText: '🟢 В нормативе (5 дн.)',
    poSlaDesc: 'В рамках 5-дневного регламента ПО.',

    planPrelimAnalysisDays: 3,
    planFinalAnalysisDays: 0,
    planAnalysisDays: 3,
    planDevDays: 0,
    planTestDays: 0,
    planAcceptanceDays: 0,
    planStabilizationDays: 0,
    planManagementDays: 0,
    planTotalDays: 3,
    planSourceTag: '',
    subPlans: {
      devCodeDays: 0,
      devBuildDays: 0,
      devDeployDays: 0,
      devBugfixDays: 0,
      devQADays: 0,
      oaReqDays: 0,
      oaQADays: 0
    },
    factPrelimAnalysisDays: 0,
    factFinalAnalysisDays: 0,
    factDevDays: 0,
    factAcceptanceDays: 0,
    factStabilizationDays: 0,
    factManagementDays: 0,
    factTotalDays: 0,
    factPaginationDeltaDays: 0,
    dateTransfer: '-',
    datePrelimAgree: '-',
    dateFinalAgree: '-',
    datePoBoundaryStr: '-',
    details: {
      po: { analyst: 0, constructor: 0, consultation: 0, commInternal: 0, commExternal: 0, management: 0, qa: 0, other: 0 },
      oa: { analyst: 0, constructor: 0, req: 0, consultation: 0, commInternal: 0, commExternal: 0, management: 0, qa: 0, other: 0 },
      dev: { code: 0, build: 0, deploy: 0, bugfix: 0, qa: 0, doc: 0, acceptance: 0, stabilization: 0, consultation: 0, commInternal: 0, commExternal: 0, management: 0, other: 0 },
      accept: { base: 0, bugfix: 0 },
      stab: { base: 0, bugfix: 0 },
      manageBreakdown: { po: 0, oa: 0, dev: 0 }
    }
  };

  window.initWidget = initWidget;
  function initWidget() {
    if (!isTaskPage()) return;

    parseTrackStudioAutoFetchPlan();

    if (document.getElementById('cyberos-ts-widget')) {
      const widget = document.getElementById('cyberos-ts-widget');
      if (widget) {
        widget.style.display = isVisible ? 'block' : 'none';
        widget.className = `size-${currentWindowSize}`;
      }
      renderValues();
      return;
    }

    const widget = document.createElement('div');
    widget.id = 'cyberos-ts-widget';
    widget.className = `size-${currentWindowSize}`;
    widget.style.display = isVisible ? 'block' : 'none';

    widget.innerHTML = `
      <div id="cyberos-ts-header">
        <h3>⚡ П-Ф по запросу <span class="cyberos-badge">v7.6</span></h3>
        
        <div class="cyberos-window-controls">
          <button class="cyberos-win-btn" id="cyberos-win-min" title="Свернуть (Минимум)">_</button>
          <button class="cyberos-win-btn" id="cyberos-win-mid" title="Стандартный размер (Средний)">❐</button>
          <button class="cyberos-win-btn" id="cyberos-win-max" title="Развернуть (Максимум)">🗖</button>
          <button class="cyberos-win-btn close-btn" id="cyberos-win-close" title="Закрыть">✕</button>
        </div>
      </div>

      <!-- Главные Закладки: П-Ф по ТЗ vs П-Ф по срокам & SLA -->
      <div class="cyberos-main-tabs">
        <button class="cyberos-tab-btn active" id="cyberos-tab-hours">📊 Трудозатраты (П-Ф)</button>
        <button class="cyberos-tab-btn" id="cyberos-tab-timeline">📅 Сроки & SLA</button>
      </div>

      <div class="cyberos-unit-toggle-container" id="cyberos-unit-panel">
        <div>
          <span style="font-size:11px; color:#94a3b8; font-weight:600;">Запрос TS:</span>
          <span style="font-weight:700; color:#38bdf8; font-size:13px;" id="cyberos-task-id">#${taskData.id || '...'}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="cyberos-toggle-label">Ед. измер.:</span>
          <div class="cyberos-toggle-btn-group">
            <button class="cyberos-toggle-btn" id="cyberos-btn-unit-hrs">⏱️ Часы</button>
            <button class="cyberos-toggle-btn active" id="cyberos-btn-unit-days">📅 Дни</button>
          </div>
        </div>
      </div>

      <div id="cyberos-ts-content">
        <!-- Блок статуса этапов ПО/ОА (S1-S7) с аларм-индикатором SLA -->
        <div class="cyberos-stat-card" id="cyberos-stage-card" style="border-left:4px solid #38bdf8; padding:10px 12px; margin-bottom:10px; background:#1e293b;">
          <div style="font-weight:bold; color:#38bdf8; font-size:11px; margin-bottom:2px; display:flex; justify-content:space-between; align-items:center;">
            <span>🚦 ТЕКУЩИЙ ЭТАП ЗАПРОСА:</span>
            <span id="cyberos-stage-code" style="background:#0284c7; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:800;">S1</span>
          </div>
          <div style="font-weight:700; color:#fbbf24; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
            <span id="cyberos-stage-title">S1: ПО - Подготовка</span>
            <span id="cyberos-stage-sla-badge" class="cyberos-sla-ok">🟢 SLA OK</span>
          </div>
          <div style="font-size:11px; color:#94a3b8; margin-top:3px; line-height:1.3;" id="cyberos-stage-desc">ПО не передавалось в банк. Следующий шаг — передача предварительного решения.</div>
        </div>

        <!-- ВКЛАДКА 1: ТРУДОЗАТРАТЫ -->
        <div id="cyberos-pane-hours">
          <div class="cyberos-stat-card">
            <div style="font-weight:bold; color:#38bdf8; margin-bottom:8px; border-bottom:1px solid #334155; padding-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
              <span>📊 Срез по этапам (План / Факт):</span>
              
              <!-- Сегментированный переключатель Детализации -->
              <div class="cyberos-segmented-control">
                <button class="cyberos-segmented-btn active" id="cyberos-seg-compact">📊 Укрупненно</button>
                <button class="cyberos-segmented-btn" id="cyberos-seg-detailed">🔍 Подробно</button>
              </div>
            </div>
            
            <!-- 1. ПО -->
            <div class="cyberos-stat-row" style="font-weight:600;" id="cyberos-row-po">
              <span class="cyberos-stat-label" id="cyberos-label-po">🔍 1. Предварительный анализ (ПО):</span>
              <span class="cyberos-stat-val"><span id="c-plan-prelim-an">3 ч.д.</span> / <span style="color:#4ade80" id="c-fact-prelim-an">0</span></span>
            </div>
            <div id="cyberos-po-breakdown-container" style="padding-left:12px; margin-bottom:4px; font-size:11px; color:#94a3b8;"></div>

            <!-- 2. ОА -->
            <div class="cyberos-stat-row" style="font-weight:600;" id="cyberos-row-oa">
              <span class="cyberos-stat-label" id="cyberos-label-oa">🔎 2. Окончательный анализ (ОА):</span>
              <span class="cyberos-stat-val"><span id="c-plan-final-an">0</span> / <span style="color:#4ade80" id="c-fact-final-an">0</span></span>
            </div>
            <div id="cyberos-oa-breakdown-container" style="padding-left:12px; margin-bottom:4px; font-size:11px; color:#94a3b8;"></div>

            <!-- 3. Реализация (разработка и тестирование) -->
            <div class="cyberos-stat-row" style="font-weight:600;">
              <span class="cyberos-stat-label">💻 3. Реализация (разработка и тестирование):</span>
              <span class="cyberos-stat-val"><span id="c-plan-dev">0</span> / <span id="c-fact-dev" style="color:#4ade80">0</span></span>
            </div>
            <div id="cyberos-dev-breakdown-container" style="padding-left:12px; margin-bottom:4px; font-size:11px; color:#94a3b8;"></div>

            <!-- 4. Приемка банком -->
            <div class="cyberos-stat-row" id="cyberos-row-accept">
              <span class="cyberos-stat-label" id="cyberos-label-accept">🏛️ 4. Приемка банком:</span>
              <span class="cyberos-stat-val"><span id="c-plan-accept">0</span> / <span id="c-fact-accept" style="color:#4ade80">0</span></span>
            </div>
            <div id="cyberos-accept-breakdown-container" style="padding-left:12px; margin-bottom:4px; font-size:11px; color:#94a3b8;"></div>

            <!-- 5. Стабилизация -->
            <div class="cyberos-stat-row" id="cyberos-row-stab">
              <span class="cyberos-stat-label" id="cyberos-label-stab">⚙️ 5. Стабилизация:</span>
              <span class="cyberos-stat-val"><span id="c-plan-stab">0</span> / <span id="c-fact-stab" style="color:#4ade80">0</span></span>
            </div>
            <div id="cyberos-stab-breakdown-container" style="padding-left:12px; margin-bottom:4px; font-size:11px; color:#94a3b8;"></div>

            <!-- 6. Управление -->
            <div class="cyberos-stat-row" style="font-weight:600;">
              <span class="cyberos-stat-label">💼 6. Управление МГР (Все этапы):</span>
              <span class="cyberos-stat-val"><span id="c-plan-manage">0</span> / <span id="c-fact-manage" style="color:#4ade80">0</span></span>
            </div>
            <div id="cyberos-manage-breakdown-container" style="padding-left:12px; margin-bottom:4px; font-size:11px; color:#94a3b8;"></div>

            <div class="cyberos-stat-row" style="margin-top:6px; border-top:1px dashed #334155; padding-top:4px; font-weight:bold;">
              <span class="cyberos-stat-label">📈 ИТОГО ПО ЗАПРОСУ:</span>
              <span class="cyberos-stat-val">
                <span id="c-plan-total">0</span> / <span id="c-fact-total" style="color:#4ade80">0</span>
                <span id="c-fact-ts-ref" style="font-size:10px; color:#94a3b8; font-weight:normal;"></span>
              </span>
            </div>
          </div>
        </div>

        <!-- ВКЛАДКА 2: СРОКИ & SLA -->
        <div id="cyberos-pane-timeline" style="display:none;">
          <div class="cyberos-stat-card">
            <div style="font-weight:bold; color:#fbbf24; margin-bottom:6px; border-bottom:1px solid #334155; padding-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
              <span>⏱️ ПРЕДИКТИВНЫЙ КОНТРОЛЛЕР СРОКОВ И SLA:</span>
              <span id="cyberos-sla-overall-badge" class="cyberos-sla-ok">🟢 On-Time</span>
            </div>

            <div class="cyberos-stat-row">
              <span class="cyberos-stat-label">🚀 Дата создания запроса:</span>
              <span class="cyberos-stat-val" id="t-date-transfer" style="color:#38bdf8;">-</span>
            </div>
            <div class="cyberos-stat-row">
              <span class="cyberos-stat-label">🕒 Потрачено на стороне Colvir:</span>
              <span class="cyberos-stat-val" id="t-colvir-days-val" style="color:#fbbf24;">0 дн.</span>
            </div>

            <div class="cyberos-pipeline-container" id="cyberos-pipeline-box">
              <!-- Пайплайн через JS -->
            </div>
          </div>
        </div>

        <div class="cyberos-stat-card">
          <div class="cyberos-stat-row">
            <span class="cyberos-stat-label">Категория:</span>
            <span class="cyberos-stat-val" id="cyberos-task-cat">Загрузка...</span>
          </div>
          <div class="cyberos-stat-row">
            <span class="cyberos-stat-label">Ответственный:</span>
            <span class="cyberos-stat-val" id="cyberos-task-assignee">-</span>
          </div>
        </div>

        <button class="cyberos-btn cyberos-btn-primary" id="cyberos-btn-export">
          📊 Выгрузить План-Факт в Excel (.xls)
        </button>
        <button class="cyberos-btn cyberos-btn-secondary" id="cyberos-btn-copy">
          📋 Скопировать отчет для Notion
        </button>
      </div>
    `;

    document.body.appendChild(widget);

    document.getElementById('cyberos-win-min').addEventListener('click', () => setWindowSize('min'));
    document.getElementById('cyberos-win-mid').addEventListener('click', () => setWindowSize('mid'));
    document.getElementById('cyberos-win-max').addEventListener('click', () => setWindowSize('max'));
    document.getElementById('cyberos-win-close').addEventListener('click', () => toggleWidget(false));

    document.getElementById('cyberos-tab-hours').addEventListener('click', () => switchTab('hours'));
    document.getElementById('cyberos-tab-timeline').addEventListener('click', () => switchTab('timeline'));

    document.getElementById('cyberos-seg-compact').addEventListener('click', () => setDetailMode(false));
    document.getElementById('cyberos-seg-detailed').addEventListener('click', () => setDetailMode(true));

    document.getElementById('cyberos-btn-unit-hrs').addEventListener('click', () => setUnit('hours'));
    document.getElementById('cyberos-btn-unit-days').addEventListener('click', () => setUnit('days'));
    document.getElementById('cyberos-btn-export').addEventListener('click', exportToExcelXLS);
    document.getElementById('cyberos-btn-copy').addEventListener('click', copyForNotion);

    renderValues();
  }

  function switchTab(tab) {
    activeTab = tab;
    const btnHours = document.getElementById('cyberos-tab-hours');
    const btnTimeline = document.getElementById('cyberos-tab-timeline');
    const paneHours = document.getElementById('cyberos-pane-hours');
    const paneTimeline = document.getElementById('cyberos-pane-timeline');
    const unitPanel = document.getElementById('cyberos-unit-panel');

    if (tab === 'hours') {
      if (btnHours) btnHours.classList.add('active');
      if (btnTimeline) btnTimeline.classList.remove('active');
      if (paneHours) paneHours.style.display = 'block';
      if (paneTimeline) paneTimeline.style.display = 'none';
      if (unitPanel) unitPanel.style.display = 'flex';
    } else {
      if (btnTimeline) btnTimeline.classList.add('active');
      if (btnHours) btnHours.classList.remove('active');
      if (paneHours) paneHours.style.display = 'none';
      if (paneTimeline) paneTimeline.style.display = 'block';
      if (unitPanel) unitPanel.style.display = 'none';
    }
  }

  function setDetailMode(isDetailed) {
    isDetailedView = isDetailed;
    const btnCompact = document.getElementById('cyberos-seg-compact');
    const btnDetailed = document.getElementById('cyberos-seg-detailed');

    if (isDetailedView) {
      if (btnDetailed) btnDetailed.classList.add('active');
      if (btnCompact) btnCompact.classList.remove('active');
    } else {
      if (btnCompact) btnCompact.classList.add('active');
      if (btnDetailed) btnDetailed.classList.remove('active');
    }

    renderValues();
  }

  function setWindowSize(size) {
    currentWindowSize = size;
    const widget = document.getElementById('cyberos-ts-widget');
    if (!widget) return;
    widget.className = `size-${size}`;
  }

  function setUnit(unit) {
    currentUnit = unit;
    const btnHrs = document.getElementById('cyberos-btn-unit-hrs');
    const btnDays = document.getElementById('cyberos-btn-unit-days');

    if (unit === 'hours') {
      if (btnHrs) btnHrs.classList.add('active');
      if (btnDays) btnDays.classList.remove('active');
    } else {
      if (btnDays) btnDays.classList.add('active');
      if (btnHrs) btnHrs.classList.remove('active');
    }

    renderValues();
  }

  function toggleWidget(forceState) {
    if (!isTaskPage()) return;
    initWidget();
    const widget = document.getElementById('cyberos-ts-widget');
    if (!widget) return;

    isVisible = forceState !== undefined ? forceState : !isVisible;
    widget.style.display = isVisible ? 'block' : 'none';

    if (isVisible) {
      autoExpandHiddenComments();
      parseTrackStudioAutoFetchPlan();
    }
  }

  function autoExpandHiddenComments() {
    const buttons = document.querySelectorAll('button, a, span, div.btn');
    buttons.forEach(b => {
      const txt = b.innerText ? b.innerText.trim().toLowerCase() : '';
      if (txt.includes('показать все') || txt.includes('все сообщения') || txt.includes('раскрыть историю') || txt.includes('show all')) {
        try {
          b.click();
        } catch (e) {}
      }
    });
  }

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "toggle_widget") {
      toggleWidget();
    }
  });

  function parseDateFromText(txt) {
    const m = txt.match(/\b(\d{2})\.(\d{2})\.(\d{2,4})\b/);
    if (!m) return null;

    const d = parseInt(m[1], 10);
    const mMonth = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);

    if (y < 100) y += 2000;

    const formattedStr = `${m[1]}.${m[2]}.${y}`;
    const dt = new Date(y, mMonth - 1, d);
    return { dateObj: dt, str: formattedStr };
  }

  function parseTrackStudioAutoFetchPlan() {
    try {
      const match = window.location.href.match(/\b(\d{6,7})\b/) || window.location.href.match(/\/task\/(\d+)/);
      if (match) {
        taskData.id = match[1];
        const idElem = document.getElementById('cyberos-task-id');
        if (idElem) idElem.innerText = '#' + taskData.id;
      }

      taskData.details = {
        po: { analyst: 0, constructor: 0, consultation: 0, commInternal: 0, commExternal: 0, management: 0, qa: 0, other: 0 },
        oa: { analyst: 0, constructor: 0, req: 0, consultation: 0, commInternal: 0, commExternal: 0, management: 0, qa: 0, other: 0 },
        dev: { code: 0, build: 0, deploy: 0, bugfix: 0, qa: 0, doc: 0, acceptance: 0, stabilization: 0, consultation: 0, commInternal: 0, commExternal: 0, management: 0, other: 0 },
        accept: { base: 0, bugfix: 0 },
        stab: { base: 0, bugfix: 0 },
        manageBreakdown: { po: 0, oa: 0, dev: 0 }
      };

      taskData.subPlans = { devCodeDays: 0, devBuildDays: 0, devDeployDays: 0, devBugfixDays: 0, devQADays: 0, oaReqDays: 0, oaQADays: 0 };
      taskData.tsHeaderSummaryDays = null;
      taskData.stateChangeDateObj = null;
      taskData.timeOnLastRoleDays = 0;
      taskData.timelineColvirDays = 0;

      // 1. Метаданные карточки
      document.querySelectorAll('tr, div, span, header, td').forEach(el => {
        const txt = el.innerText ? el.innerText.trim() : '';
        if (txt.includes('Категория:') || txt.startsWith('Категория')) {
          const p = txt.split(/Категория:?/i);
          if (p[1] && p[1].trim().length > 0 && p[1].trim().length < 60) {
            const val = p[1].trim().split('\n')[0];
            if (val && val !== 'Загрузка...') taskData.category = val;
          }
        }
        if (txt.includes('Ответственный:') || txt.startsWith('Ответственный')) {
          const p = txt.split(/Ответственный:?/i);
          if (p[1] && p[1].trim().length > 0 && p[1].trim().length < 60) {
            const val = p[1].trim().split('\n')[0];
            if (val && val !== '-') taskData.assignee = val;
          }
        }

        if (txt.includes('Дата изменения состояния:') || txt.startsWith('Дата изменения состояния')) {
          const parsed = parseDateFromText(txt);
          if (parsed) {
            taskData.stateChangeDateStr = parsed.str;
            taskData.stateChangeDateObj = parsed.dateObj;
          }
        }

        const mRole = txt.match(/Время на последней ответственной роли:\s*\??\s*([\d.,]+)/i);
        if (mRole) {
          taskData.timeOnLastRoleDays = parseFloat(mRole[1].replace(',', '.'));
        }

        const mTimeline = txt.match(/Временная шкала:\s*\??\s*([\d.,]+)\s*\(([\d.,;]+)\)\s*дн/i);
        if (mTimeline) {
          taskData.timelineColvirDays = parseFloat(mTimeline[1].replace(',', '.'));
        }

        const mTsHead = txt.match(/Внутренняя задача:\s*\d+\/\d+\s*\(([\d.,]+)\s*(?:ч\.д|дн)\)/i) || txt.match(/Связанные задачи\s*\(([\d.,]+)\s*(?:ч\.д|дн)\)/i);
        if (mTsHead) {
          taskData.tsHeaderSummaryDays = parseFloat(mTsHead[1].replace(',', '.'));
        }
      });

      if (!taskData.category) taskData.category = 'Запрос на доработку ЛПО (new)';

      // 1.5. Даты ключевых операций (ПО, Граница ОА, Передать в разработку, Завершение разработки, Приемка, Релиз)
      let datePrelimAgreeObj = null;
      let datePoBoundaryObj = null;
      let dateFinalAgreeObj = null;
      let dateDevStartObj = null;
      let dateDevCompleteObj = null; // 12.02.2026
      let dateAcceptanceStartObj = null;
      let dateReleaseObj = null;
      let poSentFlag = false;
      let oaSentFlag = false;

      document.querySelectorAll('tr, div, td, span').forEach(el => {
        const txt = el.innerText ? el.innerText.trim() : '';
        const lowerTxt = txt.toLowerCase();

        if (lowerTxt.includes('сообщить предварительные условия') || lowerTxt.includes('согласование предв') || 
            lowerTxt.includes('согласование предварительн') || lowerTxt.includes('передача предв') || lowerTxt.includes('принять предварительные')) {
          poSentFlag = true;
          const parsed = parseDateFromText(txt);
          if (parsed) {
            if (!datePrelimAgreeObj || parsed.dateObj < datePrelimAgreeObj) {
              datePrelimAgreeObj = parsed.dateObj;
              taskData.datePrelimAgree = parsed.str;
            }
          }
        }

        if (lowerTxt.includes('сообщить окончательные условия') || lowerTxt.includes('вернуть на согласование окончательной оценки') || 
            lowerTxt.includes('передать на окончательное планирование') || 
            lowerTxt.includes('передать на окончательную оценку') || 
            lowerTxt.includes('вернуть на оценку')) {
          const parsed = parseDateFromText(txt);
          if (parsed) {
            if (!datePoBoundaryObj || parsed.dateObj < datePoBoundaryObj) {
              datePoBoundaryObj = parsed.dateObj;
              taskData.datePoBoundaryStr = parsed.str;
            }
          }
        }

        if (lowerTxt.includes('согласование оконч') || lowerTxt.includes('согласование окончательн') || 
            lowerTxt.includes('согласование условий') || lowerTxt.includes('принять окончательные')) {
          oaSentFlag = true;
          const parsed = parseDateFromText(txt);
          if (parsed) {
            if (!dateFinalAgreeObj || parsed.dateObj < dateFinalAgreeObj) {
              dateFinalAgreeObj = parsed.dateObj;
              taskData.dateFinalAgree = parsed.str;
            }
          }
        }

        // ВЕХА: ПЕРЕДАТЬ В РАЗРАБОТКУ (06.01.2026)
        if (lowerTxt.includes('передать в разработку') || lowerTxt.includes('передано в разработку')) {
          const parsed = parseDateFromText(txt);
          if (parsed) {
            if (!dateDevStartObj || parsed.dateObj < dateDevStartObj) {
              dateDevStartObj = parsed.dateObj;
            }
          }
        }

        // ВЕХА: ЗАВЕРШИТЬ ВЫПОЛНЕНИЕ РАБОТЫ (12.02.2026)
        if (lowerTxt.includes('завершить выполнение работы') || lowerTxt.includes('завершить разработку')) {
          const parsed = parseDateFromText(txt);
          if (parsed) {
            if (!dateDevCompleteObj || parsed.dateObj > dateDevCompleteObj) {
              dateDevCompleteObj = parsed.dateObj;
            }
          }
        }

        if (lowerTxt.includes('готовности к приемке') || lowerTxt.includes('передать на приемку') || 
            lowerTxt.includes('приемка банком') || lowerTxt.includes('приёмка банком')) {
          const parsed = parseDateFromText(txt);
          if (parsed) {
            if (!dateAcceptanceStartObj || parsed.dateObj < dateAcceptanceStartObj) {
              dateAcceptanceStartObj = parsed.dateObj;
            }
          }
        }

        if (lowerTxt.includes('промышленную эксплуатацию') || lowerTxt.includes('сдать в опэ') || 
            lowerTxt.includes('завершить тиражирование') || lowerTxt.includes('внедрение')) {
          const parsed = parseDateFromText(txt);
          if (parsed) {
            if (!dateReleaseObj || parsed.dateObj < dateReleaseObj) {
              dateReleaseObj = parsed.dateObj;
            }
          }
        }
      });

      const effectivePoBoundaryDateObj = datePrelimAgreeObj || datePoBoundaryObj;
      const hasPoAgreed = !!datePrelimAgreeObj;
      const hasOaAgreed = !!dateFinalAgreeObj;

      taskData.isDirectTrack = (!hasPoAgreed && !datePoBoundaryObj && hasOaAgreed);

      if (!poSentFlag && !oaSentFlag && !hasPoAgreed && !hasOaAgreed && !datePoBoundaryObj) {
        taskData.stageCode = 'S1';
        taskData.stageTitle = 'S1: ПО - Подготовка';
        taskData.stageDesc = 'ПО еще не передавалось в банк. Ведется подготовка решения (лимит 5 кал. дней).';
      } else if (poSentFlag && !hasPoAgreed && !oaSentFlag && !datePoBoundaryObj) {
        taskData.stageCode = 'S2';
        taskData.stageTitle = 'S2: ПО - На согласовании у Банка';
        taskData.stageDesc = 'Предварительное решение передано в Банк. Ожидается ответ/согласование.';
      } else if ((hasPoAgreed || datePoBoundaryObj) && !oaSentFlag && !hasOaAgreed) {
        taskData.stageCode = 'S3';
        taskData.stageTitle = 'S3: ОА - Подготовка (ПО Согласовано/Отклонено)';
        taskData.stageDesc = 'ПО завершено. Ведется подготовка Окончательного анализа (ТЗ и оценки).';
      } else if (taskData.isDirectTrack) {
        taskData.stageCode = 'S4';
        taskData.stageTitle = 'S4: ОА - На согласовании (Прямой трек)';
        taskData.stageDesc = 'Прямой трек (без ПО). Окончательная оценка сформирована и передана Банку.';
      } else if (hasOaAgreed) {
        taskData.stageCode = 'S6';
        taskData.stageTitle = taskData.isDirectTrack ? 'S6: ОА - Согласовано (Прямой трек)' : 'S6: ПО и ОА Согласованы (Реализация)';
        taskData.stageDesc = 'Окончательный план согласован Банком. Запрос перешел в фазу реализации.';
      } else {
        taskData.stageCode = 'S3';
        taskData.stageTitle = 'S3: ОА - Подготовка';
        taskData.stageDesc = 'Запрос находится в процессе проработки решения.';
      }

      if (taskData.stageCode === 'S1' || taskData.stageCode === 'S2') {
        if (taskData.stateChangeDateObj) {
          const diffMs = Math.max(0, new Date() - taskData.stateChangeDateObj);
          taskData.poDaysElapsed = Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10;
        } else if (taskData.timeOnLastRoleDays > 0) {
          taskData.poDaysElapsed = taskData.timeOnLastRoleDays;
        } else {
          taskData.poDaysElapsed = 0;
        }

        if (taskData.poDaysElapsed <= 3.5) {
          taskData.poSlaStatus = 'ok';
          taskData.poSlaBadgeText = `🟢 ${taskData.poDaysElapsed} дн. из 5`;
          taskData.poSlaDesc = `В нормативе 5-дневного SLA ПО (прошло ${taskData.poDaysElapsed} дн.).`;
        } else if (taskData.poDaysElapsed <= 5.0) {
          taskData.poSlaStatus = 'warn';
          taskData.poSlaBadgeText = `🟡 ${taskData.poDaysElapsed} дн. (РИСК!)`;
          taskData.poSlaDesc = `⚠️ Внимание: Запрос в ПО уже ${taskData.poDaysElapsed} дн.! Риск превышения 5 дней.`;
        } else {
          taskData.poSlaStatus = 'danger';
          taskData.poSlaBadgeText = `🚨 ${taskData.poDaysElapsed} дн. (ПРЕВЫШЕН!)`;
          taskData.poSlaDesc = `🚨 ВНИМАНИЕ! Регламентный 5-дневный срок ПО ПРЕВЫШЕН (${taskData.poDaysElapsed} дн.)!`;
        }
      } else {
        taskData.poSlaStatus = 'ok';
        taskData.poSlaBadgeText = '🟢 Пройден';
        taskData.poSlaDesc = 'Этап Предварительного анализа успешно завершен.';
      }

      // 2. ДЕТАЛЬНЫЙ ПАРСИНГ ПОДЗАДАЧ КАЖДОГО УРОВНЯ (v7.6.1 via Allocator Module)
      let fPrelimTot = 0, fFinalTot = 0, fDevTot = 0, fAcceptTot = 0, fStabTot = 0, fManageTot = 0;

      const rowsToScan = Array.from(document.querySelectorAll('tr, div.treeTable-row, div.row, div.task-row, .tt-row, .task-list-row, [role="row"]'));
      const rawRowTexts = [];

      rowsToScan.forEach(row => {
        if (row.closest && (row.closest('#cyberos-ts-widget') || row.closest('#messages') || row.closest('#history') || row.closest('.comments') || row.closest('#operations') || row.closest('.message-content') || row.closest('#history_messages'))) return;

        const rawText = row.innerText ? row.innerText : '';
        if (rawText && rawText.length <= 500) {
          rawRowTexts.push(rawText);
        }
      });

      const milestones = {
        effectivePoBoundaryDateObj,
        dateDevStartObj,
        dateDevCompleteObj,
        dateAcceptanceStartObj,
        dateReleaseObj
      };

      const allocModule = (typeof window !== 'undefined' && window.Allocator) ? window.Allocator : (typeof Allocator !== 'undefined' ? Allocator : null);
      if (allocModule && allocModule.allocateSubtasks) {
        const allocated = allocModule.allocateSubtasks(rawRowTexts, milestones);
        if (allocated) {
          taskData.details = allocated;
        }
      }

      // Динамический пересчет итогов по всем этапам
      fPrelimTot = taskData.details.po.analyst + taskData.details.po.constructor + taskData.details.po.qa + taskData.details.po.consultation + taskData.details.po.commInternal + taskData.details.po.commExternal + taskData.details.po.other;
      fFinalTot = taskData.details.oa.analyst + taskData.details.oa.constructor + taskData.details.oa.req + taskData.details.oa.qa + taskData.details.oa.consultation + taskData.details.oa.commInternal + taskData.details.oa.commExternal + taskData.details.oa.other;
      fDevTot = taskData.details.dev.code + taskData.details.dev.build + taskData.details.dev.deploy + taskData.details.dev.bugfix + taskData.details.dev.qa + taskData.details.dev.doc + taskData.details.dev.consultation + taskData.details.dev.commInternal + taskData.details.dev.commExternal + taskData.details.dev.other;
      fAcceptTot = taskData.details.accept.base + taskData.details.accept.bugfix;
      fStabTot = taskData.details.stab.base + taskData.details.stab.bugfix;
      fManageTot = taskData.details.manageBreakdown.po + taskData.details.manageBreakdown.oa + taskData.details.manageBreakdown.dev;

      taskData.factPrelimAnalysisDays = Math.round(fPrelimTot * 10) / 10;
      taskData.factFinalAnalysisDays = Math.round(fFinalTot * 10) / 10;
      taskData.factDevDays = Math.round(fDevTot * 10) / 10;
      taskData.factAcceptanceDays = Math.round(fAcceptTot * 10) / 10;
      taskData.factStabilizationDays = Math.round(fStabTot * 10) / 10;
      taskData.factManagementDays = Math.round(fManageTot * 10) / 10;

      // 100% СВЕРКА СУММЫ ВСЕХ ЭТАПОВ С БД TRACKSTUDIO И ШАПКОЙ
      const fSumDom = Math.round((fPrelimTot + fFinalTot + fDevTot + fAcceptTot + fStabTot + fManageTot) * 10) / 10;
      if (taskData.tsHeaderSummaryDays !== null && taskData.tsHeaderSummaryDays > 0) {
        taskData.factTotalDays = taskData.tsHeaderSummaryDays;
        taskData.factPaginationDeltaDays = Math.max(0, Math.round((taskData.tsHeaderSummaryDays - fSumDom) * 10) / 10);
      } else {
        taskData.factTotalDays = fSumDom;
        taskData.factPaginationDeltaDays = 0;
      }

      // 3. ПАРСЕР ПЛАНА (Чистый бюджет этапов в днях по таблице MS Project)
      let pAnDays = 0, pDevDays = 0, pAcceptDays = 0, pStabDays = 0, pManageDays = 0;
      let bestDevCodeDays = 0, bestDevBuildDays = 0, bestDevDeployDays = 0, bestDevBugfixDays = 0, bestDevQADays = 0, bestDevCommDays = 0;
      let bestOaReqDays = 0, bestOaQADays = 0;
      let foundPlanSource = false;

      const validPlanTables = [];
      document.querySelectorAll('table').forEach(table => {
        if (table.closest && table.closest('#cyberos-ts-widget')) return;

        const text = table.innerText ? table.innerText.toLowerCase() : '';
        let matches = 0;
        if (text.includes('реализация') || text.includes('разработка')) matches++;
        if (text.includes('управление')) matches++;
        if (text.includes('приемка') || text.includes('приёмка') || text.includes('поддержка при запуске')) matches++;
        if (text.includes('стабилизация') || text.includes('поддержка')) matches++;
        if (text.includes('анализ') || text.includes('оценка')) matches++;

        const isSubtaskTable = text.includes('состояние') && text.includes('исполнитель');

        if (matches >= 2 && !isSubtaskTable) {
          validPlanTables.push(table);
        }
      });

      const latestPlanTable = validPlanTables.length > 0 ? validPlanTables[validPlanTables.length - 1] : null;
      const tablesToProcess = latestPlanTable ? [latestPlanTable] : validPlanTables;

      tablesToProcess.forEach(table => {
        let tAn = 0, tAnSubSum = 0, tDev = 0, tAccept = 0, tStab = 0, tManage = 0;
        let tDevCode = 0, tDevBuild = 0, tDevDeploy = 0, tDevBugfix = 0, tDevQA = 0, tDevComm = 0;
        let tOaReq = 0, tOaQA = 0;

        table.querySelectorAll('tr').forEach(tr => {
          const isStrikethrough = tr.querySelector('s, strike, del') !== null ||
                                  tr.innerHTML.includes('<s>') || tr.innerHTML.includes('<strike>') || tr.innerHTML.includes('<del>') ||
                                  tr.style.textDecoration.includes('line-through') ||
                                  (tr.getAttribute('style') && tr.getAttribute('style').includes('line-through'));

          if (isStrikethrough) return;

          const txt = tr.innerText ? tr.innerText.trim() : '';
          const cells = tr.querySelectorAll('td, th');

          if (cells.length >= 2) {
            const rowName = cells[0].innerText ? cells[0].innerText.trim() : '';
            const valText = cells[1].innerText ? cells[1].innerText.trim() : '';

            const mHrs = valText.match(/^(\d+[.,]?\d*)\s*ч/i) || txt.match(/^([^\d]*)\b(\d+[.,]?\d*)\s*ч/i);
            const mDays = valText.match(/^(\d+[.,]?\d*)\s*дне/i) || txt.match(/(\d+[.,]?\d*)\s*дне/i);

            let hrs = 0;
            if (mHrs) {
              hrs = parseFloat((mHrs[1] || mHrs[2]).replace(',', '.'));
            } else if (mDays) {
              hrs = parseFloat(mDays[1].replace(',', '.')) * 8;
            }

            if (hrs > 0) {
              const lowerName = rowName.toLowerCase().trim();

              // ИГНОРИРУЕМ ИТОГОВЫЕ СТРОКИ ("Итого", "Всего"), чтобы не учитывать суммарный план повторно
              if (lowerName.startsWith('итого') || lowerName.startsWith('всего') || lowerName.includes('всего по') || lowerName.includes('итого планируемые')) {
                return;
              }

              const isMilestone = lowerName.includes('согласован') || lowerName.includes('передан');

              if (lowerName === 'управление запросом' || lowerName === 'управление' || (lowerName.includes('управление') && !lowerName.includes('команде'))) {
                tManage = hrs / 8;
                foundPlanSource = true;
              } else if (lowerName === 'реализация' || lowerName === 'разработка') {
                tDev = hrs / 8;
                foundPlanSource = true;
              } else if (lowerName.includes('приемка') || lowerName.includes('приёмка')) {
                tAccept = hrs / 8;
                foundPlanSource = true;
              } else if (lowerName.includes('стабилизация') || lowerName.includes('поддержка при запуске')) {
                tStab += hrs / 8;
                foundPlanSource = true;
              } else if (!isMilestone && (lowerName.includes('окончательная оценка') || lowerName.includes('предварительная оценка') || lowerName === 'анализ')) {
                tAn = hrs / 8;
                foundPlanSource = true;
              } else if (!isMilestone && (lowerName.includes('подготовить требования') || lowerName.includes('подготовить постановку') || lowerName.includes('разработка требований') || lowerName.includes('подготовка тз'))) {
                tAnSubSum += hrs / 8;
                tOaReq += hrs / 8;
                foundPlanSource = true;
              }

              if (lowerName.includes('разработка ядро') || lowerName.includes('разработка рко') || lowerName.includes('разработка бос') || lowerName === 'разработка' || lowerName === 'разработка по') {
                tDevCode += hrs / 8;
              } else if (lowerName.includes('сборка патча') || lowerName.includes('сборка дистрибутива') || lowerName.includes('подготовка дистрибутива') || lowerName.includes('технологические задачи') || lowerName.includes('сборка и тиражирование')) {
                tDevBuild += hrs / 8;
              } else if (lowerName.includes('устранение замечаний тестирования') || lowerName.includes('исправление замечаний тестирования')) {
                tDevBugfix += hrs / 8;
              } else if (lowerName.includes('тестирование от') || lowerName === 'тестирование' || lowerName.includes('тестирование по')) {
                tDevQA += hrs / 8;
              } else if (lowerName.includes('коммуникаци')) {
                tDevComm += hrs / 8;
              } else if (lowerName.includes('оценка от') && !isMilestone) {
                tOaQA += hrs / 8;
                tAnSubSum += hrs / 8;
              }
            }
          }
        });

        bestDevCodeDays = tDevCode;
        bestDevBuildDays = tDevBuild;
        bestDevDeployDays = tDevDeploy;
        bestDevBugfixDays = tDevBugfix;
        bestDevQADays = tDevQA;
        bestDevCommDays = tDevComm;
        bestOaReqDays = tOaReq;
        bestOaQADays = tOaQA;

        pAnDays = (tAn > 0) ? tAn : tAnSubSum;
        let calculatedDevSum = tDevCode + tDevBuild + tDevDeploy + tDevBugfix + tDevQA + tDevComm;
        pDevDays = (calculatedDevSum > 0) ? calculatedDevSum : tDev;
        pAcceptDays = tAccept;
        pStabDays = tStab;
        pManageDays = tManage;
      });

      if (!foundPlanSource) {
        // Фоллбэк: текстовый парсинг планов из комментариев/описания (если таблица <table> не найдена)
        document.querySelectorAll('div, p, li, td, blockquote').forEach(el => {
          if (el.closest && el.closest('#cyberos-ts-widget')) return;
          const txt = el.innerText ? el.innerText.trim() : '';
          if (!txt || txt.length > 500) return;

          const lowerTxt = txt.toLowerCase();

          const mAn = lowerTxt.match(/(?:оценка|анализ|постановк)\s*[:\-—]?\s*(\d+[.,]?\d*)\s*ч/i);
          if (mAn && pAnDays === 0) {
            pAnDays = parseFloat(mAn[1].replace(',', '.')) / 8;
            foundPlanSource = true;
          }

          const mDev = lowerTxt.match(/(?:разработк|реализаци)\s*[:\-—]?\s*(\d+[.,]?\d*)\s*ч/i);
          if (mDev && pDevDays === 0) {
            pDevDays = parseFloat(mDev[1].replace(',', '.')) / 8;
            foundPlanSource = true;
          }

          const mAcc = lowerTxt.match(/(?:приемк|приёмк)\s*[:\-—]?\s*(\d+[.,]?\d*)\s*ч/i);
          if (mAcc && pAcceptDays === 0) {
            pAcceptDays = parseFloat(mAcc[1].replace(',', '.')) / 8;
            foundPlanSource = true;
          }

          const mMng = lowerTxt.match(/управлен\w*\s*[:\-—]?\s*(\d+[.,]?\d*)\s*ч/i);
          if (mMng && pManageDays === 0) {
            pManageDays = parseFloat(mMng[1].replace(',', '.')) / 8;
            foundPlanSource = true;
          }
        });
      }

      if (foundPlanSource) {
        taskData.planSourceTag = '[План: Комментарий MS Project]';
      } else {
        taskData.planSourceTag = '[План: Не задан в комментарии]';
      }

      taskData.planFinalAnalysisDays = Math.round(pAnDays * 10) / 10;
      taskData.planAnalysisDays = Math.round(pAnDays * 10) / 10;
      taskData.planDevDays = Math.round(pDevDays * 10) / 10;
      taskData.planAcceptanceDays = Math.round(pAcceptDays * 10) / 10;
      taskData.planStabilizationDays = Math.round(pStabDays * 10) / 10;
      taskData.planManagementDays = Math.round(pManageDays * 10) / 10;
      taskData.planTotalDays = Math.round((pAnDays + pDevDays + pAcceptDays + pStabDays + pManageDays) * 10) / 10;

      taskData.subPlans.devCodeDays = Math.round(bestDevCodeDays * 10) / 10;
      taskData.subPlans.devBuildDays = Math.round(bestDevBuildDays * 10) / 10;
      taskData.subPlans.devDeployDays = Math.round(bestDevDeployDays * 10) / 10;
      taskData.subPlans.devBugfixDays = Math.round(bestDevBugfixDays * 10) / 10;
      taskData.subPlans.devQADays = Math.round(bestDevQADays * 10) / 10;
      taskData.subPlans.devCommDays = Math.round(bestDevCommDays * 10) / 10;
      taskData.subPlans.oaReqDays = Math.round(bestOaReqDays * 10) / 10;
      taskData.subPlans.oaQADays = Math.round(bestOaQADays * 10) / 10;

      // 4. ДАТЫ
      const foundDates = [];
      document.querySelectorAll('td, span, div').forEach(el => {
        const txt = el.innerText ? el.innerText.trim() : '';
        const parsed = parseDateFromText(txt);
        if (parsed) foundDates.push(parsed.str);
      });

      if (foundDates.length > 0) {
        foundDates.sort((a, b) => {
          const [d1, m1, y1] = a.split('.').map(Number);
          const [d2, m2, y2] = b.split('.').map(Number);
          return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
        });
        taskData.dateTransfer = foundDates[0];
      }

      renderValues();
    } catch (err) {
      console.warn("⚠️ CyberOS TrackStudio Helper error in DOM parsing:", err);
    }
  }

  function renderValues() {
    try {
      const isHours = (currentUnit === 'hours');
      const unitSuffix = isHours ? ' ч.' : ' ч.д.';
      const factor = isHours ? 8 : 1;

      const catElem = document.getElementById('cyberos-task-cat');
      const assigneeElem = document.getElementById('cyberos-task-assignee');

      if (catElem) catElem.innerText = taskData.category || 'Запрос на доработку ЛПО (new)';
      if (assigneeElem) assigneeElem.innerText = taskData.assignee || 'Грошев Дмитрий';

      const stageCodeElem = document.getElementById('cyberos-stage-code');
      const stageTitleElem = document.getElementById('cyberos-stage-title');
      const stageDescElem = document.getElementById('cyberos-stage-desc');
      const stageSlaBadge = document.getElementById('cyberos-stage-sla-badge');
      const stageCard = document.getElementById('cyberos-stage-card');

      if (stageCodeElem) stageCodeElem.innerText = taskData.stageCode || 'S1';
      if (stageTitleElem) stageTitleElem.innerText = taskData.stageTitle || 'S1: ПО - Подготовка';
      if (stageDescElem) stageDescElem.innerText = taskData.stageDesc || 'В процессе проработки.';

      if (stageSlaBadge) {
        stageSlaBadge.innerText = taskData.poSlaBadgeText;
        if (taskData.poSlaStatus === 'danger') {
          stageSlaBadge.className = 'cyberos-sla-danger';
          if (stageCard) stageCard.style.borderLeftColor = '#ef4444';
        } else if (taskData.poSlaStatus === 'warn') {
          stageSlaBadge.className = 'cyberos-sla-warn';
          if (stageCard) stageCard.style.borderLeftColor = '#f59e0b';
        } else {
          stageSlaBadge.className = 'cyberos-sla-ok';
          if (stageCard) stageCard.style.borderLeftColor = '#38bdf8';
        }
      }

      const fmt = (days) => Math.round(days * factor * 10) / 10 + unitSuffix;

      const labelPo = document.getElementById('cyberos-label-po');
      const rowOa = document.getElementById('cyberos-row-oa');

      if (taskData.isDirectTrack) {
        if (labelPo) labelPo.innerHTML = `🔍 1. Анализ (ПО + ОА объединены) <span style="font-size:10px; color:#fbbf24;">[Прямой трек]</span>:`;
        if (rowOa) rowOa.style.display = 'none';
        
        const totAnalysisFact = (taskData.factPrelimAnalysisDays || 0) + (taskData.factFinalAnalysisDays || 0);
        const totAnalysisPlan = (taskData.planPrelimAnalysisDays || 3) + (taskData.planFinalAnalysisDays || 0);

        const elemPrelimPlan = document.getElementById('c-plan-prelim-an');
        const elemPrelimFact = document.getElementById('c-fact-prelim-an');
        if (elemPrelimPlan) elemPrelimPlan.innerText = fmt(totAnalysisPlan);
        if (elemPrelimFact) elemPrelimFact.innerText = fmt(totAnalysisFact);
      } else {
        if (labelPo) labelPo.innerText = `🔍 1. Предварительный анализ (ПО):`;
        if (rowOa) rowOa.style.display = 'flex';

        const elemPrelimPlan = document.getElementById('c-plan-prelim-an');
        const elemPrelimFact = document.getElementById('c-fact-prelim-an');
        if (elemPrelimPlan) elemPrelimPlan.innerText = fmt(taskData.planPrelimAnalysisDays || 3);
        if (elemPrelimFact) elemPrelimFact.innerText = fmt(taskData.factPrelimAnalysisDays || 0);

        const elemFinalPlan = document.getElementById('c-plan-final-an');
        const elemFinalFact = document.getElementById('c-fact-final-an');
        if (elemFinalPlan) elemFinalPlan.innerText = fmt(taskData.planFinalAnalysisDays || 0);
        if (elemFinalFact) elemFinalFact.innerText = fmt(taskData.factFinalAnalysisDays || 0);
      }

      const elemDevPlan = document.getElementById('c-plan-dev');
      const elemDevFact = document.getElementById('c-fact-dev');
      if (elemDevPlan) elemDevPlan.innerText = fmt(taskData.planDevDays || 0);
      if (elemDevFact) elemDevFact.innerText = fmt(taskData.factDevDays || 0);

      // ОВЕРЛЕЙ / ОБЪЕДИНЕНИЕ 4. Приемка банком + 5. Стабилизация
      const rowAccept = document.getElementById('cyberos-row-accept');
      const rowStab = document.getElementById('cyberos-row-stab');
      const labelAccept = document.getElementById('cyberos-label-accept');

      const isOnlyOneReleaseItemInPlan = (taskData.planAcceptanceDays === 0 && taskData.planStabilizationDays > 0) || 
                                          (taskData.planAcceptanceDays > 0 && taskData.planStabilizationDays === 0);

      if (isOnlyOneReleaseItemInPlan) {
        if (labelAccept) labelAccept.innerText = '🏛️ 4. Приемка банком & Стабилизация:';
        if (rowStab) rowStab.style.display = 'none';

        const combinedPlan = (taskData.planAcceptanceDays || 0) + (taskData.planStabilizationDays || 0);
        const combinedFact = Math.round(((taskData.factAcceptanceDays || 0) + (taskData.factStabilizationDays || 0)) * 10) / 10;

        const elemAcceptPlan = document.getElementById('c-plan-accept');
        const elemAcceptFact = document.getElementById('c-fact-accept');
        if (elemAcceptPlan) elemAcceptPlan.innerText = fmt(combinedPlan);
        if (elemAcceptFact) elemAcceptFact.innerText = fmt(combinedFact);
      } else {
        if (labelAccept) labelAccept.innerText = '🏛️ 4. Приемка банком:';
        if (rowStab) rowStab.style.display = 'flex';

        const elemAcceptPlan = document.getElementById('c-plan-accept');
        const elemAcceptFact = document.getElementById('c-fact-accept');
        if (elemAcceptPlan) elemAcceptPlan.innerText = fmt(taskData.planAcceptanceDays || 0);
        if (elemAcceptFact) elemAcceptFact.innerText = fmt(taskData.factAcceptanceDays || 0);

        const elemStabPlan = document.getElementById('c-plan-stab');
        const elemStabFact = document.getElementById('c-fact-stab');
        if (elemStabPlan) elemStabPlan.innerText = fmt(taskData.planStabilizationDays || 0);
        if (elemStabFact) elemStabFact.innerText = fmt(taskData.factStabilizationDays || 0);
      }

      const elemManagePlan = document.getElementById('c-plan-manage');
      const elemManageFact = document.getElementById('c-fact-manage');
      if (elemManagePlan) elemManagePlan.innerText = fmt(taskData.planManagementDays || 0);
      if (elemManageFact) elemManageFact.innerText = fmt(taskData.factManagementDays || 0);

      const elemTotalPlan = document.getElementById('c-plan-total');
      const elemTotalFact = document.getElementById('c-fact-total');
      const elemTsRef = document.getElementById('c-fact-ts-ref');

      if (elemTotalPlan) elemTotalPlan.innerText = fmt(taskData.planTotalDays || 0);
      if (elemTotalFact) elemTotalFact.innerText = fmt(taskData.factTotalDays || 0);

      if (elemTsRef) {
        if (taskData.tsHeaderSummaryDays !== null) {
          elemTsRef.innerText = ` (из ${fmt(taskData.tsHeaderSummaryDays)} в БД TS)`;
        } else {
          elemTsRef.innerText = '';
        }
      }

      renderDetailsBreakdown(fmt, isOnlyOneReleaseItemInPlan);
      renderTimelineAndSLA();
    } catch (err) {
      console.warn("⚠️ CyberOS TrackStudio Helper error in rendering:", err);
    }
  }

  function renderTimelineAndSLA() {
    const tTransfer = document.getElementById('t-date-transfer');
    const tColvirVal = document.getElementById('t-colvir-days-val');
    const tSlaBadge = document.getElementById('cyberos-sla-overall-badge');
    const pipelineBox = document.getElementById('cyberos-pipeline-box');

    if (tTransfer) tTransfer.innerText = taskData.dateTransfer || taskData.stateChangeDateStr || '-';
    if (tColvirVal) {
      const daysShow = taskData.poDaysElapsed > 0 ? taskData.poDaysElapsed : (taskData.timelineColvirDays || 0);
      tColvirVal.innerText = `${daysShow} дн.`;
    }

    if (tSlaBadge) {
      if (taskData.poSlaStatus === 'danger') {
        tSlaBadge.innerText = '🔴 SLA ПРЕВЫШЕН!';
        tSlaBadge.className = 'cyberos-sla-danger';
      } else if (taskData.poSlaStatus === 'warn') {
        tSlaBadge.innerText = '🟡 РИСК SLA';
        tSlaBadge.className = 'cyberos-sla-warn';
      } else {
        tSlaBadge.innerText = '🟢 В норме SLA';
        tSlaBadge.className = 'cyberos-sla-ok';
      }
    }

    if (pipelineBox) {
      const code = taskData.stageCode;
      const hasPoAgreed = !!taskData.datePrelimAgree && taskData.datePrelimAgree !== '-';
      const hasOaAgreed = !!taskData.dateFinalAgree && taskData.dateFinalAgree !== '-';

      let html = '';

      // ЭТАП 1: ПО
      const isStep1Active = (code === 'S1' || code === 'S2');
      const step1Class = taskData.poSlaStatus === 'danger' ? 'overdue' : (isStep1Active ? 'active' : '');
      const step1StatusBadge = hasPoAgreed 
        ? '<span class="cyberos-sla-ok">🟢 Согласовано</span>' 
        : (isStep1Active ? `<span class="${taskData.poSlaStatus === 'danger' ? 'cyberos-sla-danger' : (taskData.poSlaStatus === 'warn' ? 'cyberos-sla-warn' : 'cyberos-sla-ok')}">${taskData.poSlaBadgeText}</span>` : '<span>⚪ Пройден</span>');

      html += `
        <div class="cyberos-pipeline-step ${step1Class}">
          <div class="cyberos-step-header">
            <span>1. 🔍 Предварительный анализ (ПО)</span>
            ${step1StatusBadge}
          </div>
          <div class="cyberos-step-body">
            • <b>Регламентный SLA:</b> До 5 кал. дней (Лимит 24 ч.д.).<br>
            • <b>Дней на стороне Colvir:</b> ${taskData.poDaysElapsed} дн.<br>
            • <b>Дата согласования ПО:</b> ${taskData.datePrelimAgree || '-'}<br>
            <div style="margin-top:2px; font-size:10px; color:${taskData.poSlaStatus === 'danger' ? '#f87171' : '#94a3b8'}">${taskData.poSlaDesc}</div>
          </div>
        </div>
      `;

      // ЭТАП 2: ОА
      const isStep2Active = (code === 'S3' || code === 'S4' || code === 'S5');
      const step2Class = isStep2Active ? 'active' : '';
      const step2Badge = hasOaAgreed ? '<span class="cyberos-sla-ok">🟢 Согласовано</span>' : (isStep2Active ? '<span class="cyberos-sla-warn">⏳ В работе (по MS Project)</span>' : '<span>⚪ Ожидание</span>');

      html += `
        <div class="cyberos-pipeline-step ${step2Class}">
          <div class="cyberos-step-header">
            <span>2. 🔎 Окончательный анализ (ОА)</span>
            ${step2Badge}
          </div>
          <div class="cyberos-step-body">
            • <b>План по MS Project:</b> ${taskData.planAnalysisDays} ч.д. (${taskData.planAnalysisDays * 8} ч.)<br>
            • <b>Факт списаний ОА:</b> ${taskData.factFinalAnalysisDays} ч.д.<br>
            • <b>Дата согласования ОА:</b> ${taskData.dateFinalAgree || '-'}
          </div>
        </div>
      `;

      // ЭТАП 3: Реализация
      const isStep3Active = (code === 'S6' && !taskData.dateReleaseObj);
      const step3Class = isStep3Active ? 'active' : '';
      html += `
        <div class="cyberos-pipeline-step ${step3Class}">
          <div class="cyberos-step-header">
            <span>3. 💻 Реализация (разработка и тестирование)</span>
            ${isStep3Active ? '<span class="cyberos-sla-ok">⏳ В работе</span>' : '<span>⚪ Будущий этап</span>'}
          </div>
          <div class="cyberos-step-body">
            • <b>План по MS Project:</b> ${taskData.planDevDays} ч.д. (${taskData.planDevDays * 8} ч.)<br>
            • <b>Факт разработки и теста:</b> ${taskData.factDevDays} ч.д.
          </div>
        </div>
      `;

      // ЭТАП 4: Приемка банком
      html += `
        <div class="cyberos-pipeline-step">
          <div class="cyberos-step-header">
            <span>4. 🏛️ Приемка банком & Стабилизация</span>
            <span>⚪ Завершающий этап</span>
          </div>
          <div class="cyberos-step-body">
            • <b>План поддержки:</b> ${taskData.planAcceptanceDays + taskData.planStabilizationDays} ч.д. | <b>Факт:</b> ${taskData.factAcceptanceDays + taskData.factStabilizationDays} ч.д.
          </div>
        </div>
      `;

      pipelineBox.innerHTML = html;
    }
  }

  function renderDetailsBreakdown(fmt, isMergedAcceptStab) {
    const poContainer = document.getElementById('cyberos-po-breakdown-container');
    const oaContainer = document.getElementById('cyberos-oa-breakdown-container');
    const devContainer = document.getElementById('cyberos-dev-breakdown-container');
    const acceptContainer = document.getElementById('cyberos-accept-breakdown-container');
    const stabContainer = document.getElementById('cyberos-stab-breakdown-container');
    const manageContainer = document.getElementById('cyberos-manage-breakdown-container');

    if (!isDetailedView) {
      if (poContainer) poContainer.innerHTML = '';
      if (oaContainer) oaContainer.innerHTML = '';
      if (devContainer) devContainer.innerHTML = '';
      if (acceptContainer) acceptContainer.innerHTML = '';
      if (stabContainer) stabContainer.innerHTML = '';
      if (manageContainer) manageContainer.innerHTML = '';
      return;
    }

    const fmtSub = (pDays, fDays) => {
      if (pDays > 0) {
        return `<span style="color:#94a3b8">План ${fmt(pDays)}</span> / <span style="color:#4ade80; font-weight:600;">Факт ${fmt(fDays)}</span>`;
      }
      return `<span style="color:#64748b">—</span> / <span style="color:#4ade80; font-weight:600;">Факт ${fmt(fDays)}</span>`;
    };

    const po = taskData.details.po;
    const oa = taskData.details.oa;
    const sp = taskData.subPlans;

    // 1. ПО ДЕТАЛИЗАЦИЯ
    let poHtml = '';
    const poAnConstrFact = po.analyst + po.constructor;
    if (poAnConstrFact > 0) poHtml += `<div>├─ 📝 Анализ А и К (ПО): ${fmtSub(0, poAnConstrFact)}</div>`;
    if (po.qa > 0) poHtml += `<div>├─ 🛡️ Оценка ОТ (ПО): ${fmtSub(0, po.qa)}</div>`;
    if (po.consultation > 0) poHtml += `<div>├─ 💬 Консультации (ПО): ${fmtSub(0, po.consultation)}</div>`;
    if (po.commExternal > 0) poHtml += `<div>├─ 📞 Внешние коммуникации (ПО): ${fmtSub(0, po.commExternal)}</div>`;
    if (po.commInternal > 0) poHtml += `<div>├─ 🤝 Внутренние коммуникации (ПО): ${fmtSub(0, po.commInternal)}</div>`;
    if (po.other > 0) poHtml += `<div>└─ 🔹 Прочее (ПО): ${fmtSub(0, po.other)}</div>`;
    
    if (poHtml === '') poHtml = `<div style="color:#64748b; font-style:italic;">└─ (Нет фактических списаний)</div>`;
    if (poContainer) poContainer.innerHTML = poHtml;

    // 2. ОА ДЕТАЛИЗАЦИЯ (Оценка ОТ / Методика тестирования)
    if (!taskData.isDirectTrack) {
      let oaHtml = '';
      const totalOaReq = oa.req + oa.analyst + oa.constructor;
      if (totalOaReq > 0 || sp.oaReqDays > 0) oaHtml += `<div>├─ 📝 ОА: Решение / Постановки: ${fmtSub(sp.oaReqDays, totalOaReq)}</div>`;
      if (oa.qa > 0 || sp.oaQADays > 0) oaHtml += `<div>├─ 🛡️ Оценка ОТ / Методика тестирования: ${fmtSub(sp.oaQADays, oa.qa)}</div>`;
      if (oa.consultation > 0) oaHtml += `<div>├─ 💬 Консультации: ${fmtSub(0, oa.consultation)}</div>`;
      if (oa.commExternal > 0) oaHtml += `<div>├─ 📞 Внешние коммуникации: ${fmtSub(0, oa.commExternal)}</div>`;
      if (oa.commInternal > 0) oaHtml += `<div>└─ 🤝 Внутренние коммуникации: ${fmtSub(0, oa.commInternal)}</div>`;
      
      if (oaHtml === '') oaHtml = `<div style="color:#64748b; font-style:italic;">└─ (Нет фактических списаний)</div>`;
      if (oaContainer) oaContainer.innerHTML = oaHtml;
    } else {
      if (oaContainer) oaContainer.innerHTML = '';
    }

    // 3. РЕАЛИЗАЦИЯ ДЕТАЛИЗАЦИЯ
    const dev = taskData.details.dev;
    let devHtml = '';

    devHtml += `<div>├─ 💻 Разработка (Кодирование): ${fmtSub(sp.devCodeDays, dev.code)}</div>`;

    const buildDeployFact = dev.build + dev.deploy;
    const buildDeployPlan = sp.devBuildDays + sp.devDeployDays;
    if (buildDeployFact > 0 || buildDeployPlan > 0) {
      devHtml += `<div>├─ 📦 Технологические задачи, сборка и тиражирование: ${fmtSub(buildDeployPlan, buildDeployFact)}</div>`;
    }

    if (dev.bugfix > 0 || sp.devBugfixDays > 0) {
      const isBugWarn = (sp.devBugfixDays > 0 && dev.bugfix > sp.devBugfixDays) || (sp.devBugfixDays === 0 && dev.bugfix > 0);
      const bugWarnTag = isBugWarn ? ' <span style="color:#fbbf24">⚠️</span>' : '';
      devHtml += `<div>├─ 🐛 Исправление замечаний тестирования ОТ (до завершения разработки): ${fmtSub(sp.devBugfixDays, dev.bugfix)}${bugWarnTag}</div>`;
    }

    devHtml += `<div>├─ 🛡️ Тестирование ОТ (Проведение испытаний): ${fmtSub(sp.devQADays, dev.qa)}</div>`;
    if (dev.doc > 0) devHtml += `<div>├─ 📄 Документирование / Пользовательская документация: ${fmtSub(0, dev.doc)}</div>`;
    if (dev.consultation > 0) devHtml += `<div>├─ 💬 Консультации (В ходе разработки/теста): ${fmtSub(0, dev.consultation)}</div>`;
    const devCommPlan = sp.devCommDays || 0;
    if (dev.commInternal > 0 || dev.commExternal > 0 || devCommPlan > 0) {
      devHtml += `<div>└─ 🤝 Коммуникации в команде: ${fmtSub(devCommPlan, dev.commInternal + dev.commExternal)}</div>`;
    }

    if (devHtml === '') devHtml = `<div style="color:#64748b; font-style:italic;">└─ (Нет фактических списаний)</div>`;
    if (devContainer) devContainer.innerHTML = devHtml;

    // 4. ПРИЕМКА & 5. СТАБИЛИЗАЦИЯ ДЕТАЛИЗАЦИЯ
    const acc = taskData.details.accept;
    const st = taskData.details.stab;

    if (isMergedAcceptStab) {
      let mergedHtml = '';
      const combinedFact = acc.base + acc.bugfix + st.base + st.bugfix;
      if (acc.base > 0 || st.base > 0) mergedHtml += `<div>├─ 🏛️ Поддержка при запуске / Приемка: ${fmtSub(0, acc.base + st.base)}</div>`;
      if (acc.bugfix > 0 || st.bugfix > 0) mergedHtml += `<div style="color:#fbbf24">└─ 🐛 Обработка и исправление замечаний Банка: ${fmtSub(0, acc.bugfix + st.bugfix)} ⚠️</div>`;
      if (mergedHtml === '' && combinedFact > 0) mergedHtml = `<div>└─ 🏛️ Сопровождение релиза: ${fmtSub(0, combinedFact)}</div>`;
      if (acceptContainer) acceptContainer.innerHTML = mergedHtml;
      if (stabContainer) stabContainer.innerHTML = '';
    } else {
      let accHtml = '';
      if (acc.base > 0) accHtml += `<div>├─ 🏛️ Приемка работа/демонстрация: ${fmtSub(0, acc.base)}</div>`;
      if (acc.bugfix > 0) accHtml += `<div style="color:#fbbf24">└─ 🐛 Обработка и исправление замечаний Банка: ${fmtSub(0, acc.bugfix)} ⚠️</div>`;
      if (accHtml === '' && taskData.factAcceptanceDays > 0) accHtml = `<div>└─ 🏛️ Приемка: ${fmtSub(0, taskData.factAcceptanceDays)}</div>`;
      if (acceptContainer) acceptContainer.innerHTML = accHtml;

      let stHtml = '';
      if (st.base > 0) stHtml += `<div>├─ ⚙️ Внедрение / Сопровождение ОПЭ: ${fmtSub(0, st.base)}</div>`;
      if (st.bugfix > 0) stHtml += `<div style="color:#fbbf24">└─ 🐛 Исправление багов на ПЭВМ/Проде: ${fmtSub(0, st.bugfix)} ⚠️</div>`;
      if (stHtml === '' && taskData.factStabilizationDays > 0) stHtml = `<div>└─ ⚙️ Стабилизация: ${fmtSub(0, taskData.factStabilizationDays)}</div>`;
      
      if (taskData.factPaginationDeltaDays > 0) {
        stHtml += `<div style="color:#38bdf8; font-weight:600; margin-top:4px;">📄 +${fmt(taskData.factPaginationDeltaDays)} (подзадачи на след. страницах TS)</div>`;
      }

      if (stabContainer) stabContainer.innerHTML = stHtml;
    }

    // 6. УПРАВЛЕНИЕ МГР С ДЕТАЛИЗАЦИЕЙ ПО ЭТАПАМ
    const mb = taskData.details.manageBreakdown;
    const pManage = taskData.planManagementDays;
    let manageHtml = '';
    if (mb.po > 0) manageHtml += `<div>├─ 💼 Управление на этапе ПО: ${fmtSub(0, mb.po)}</div>`;
    if (mb.oa > 0) manageHtml += `<div>├─ 💼 Управление на этапе ОА: ${fmtSub(0, mb.oa)}</div>`;
    if (mb.dev > 0) manageHtml += `<div>└─ 💼 Управление в Реализации: ${fmtSub(pManage, mb.dev)}</div>`;
    else if (pManage > 0 || (mb.po + mb.oa + mb.dev > 0)) manageHtml += `<div>└─ 💼 Управление МГР: ${fmtSub(pManage, mb.dev)}</div>`;
    if (manageHtml === '') manageHtml = `<div style="color:#64748b; font-style:italic;">└─ (Нет фактических списаний)</div>`;
    if (manageContainer) manageContainer.innerHTML = manageHtml;
  }

  function exportToExcelXLS() {
    parseTrackStudioAutoFetchPlan();

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <style>
          th { background-color: #003366; color: #ffffff; font-weight: bold; border: 1px solid #ccc; }
          td { border: 1px solid #ccc; font-family: Calibri, Arial; }
          .num { text-align: right; }
          .header-title { font-size: 16px; font-weight: bold; color: #003366; }
        </style>
      </head>
      <body>
        <table>
          <tr><td colspan="15" class="header-title">ОТЧЕТ ПЛАН-ФАКТ «П-Ф ПО ЗАПРОСУ» (v7.6.0) — ЗАПРОС #${taskData.id}</td></tr>
          <tr><td colspan="15">Сгенерировано CyberOS TrackStudio Helper | Статус: ${taskData.stageTitle}</td></tr>
          <tr><td colspan="15"></td></tr>
          <tr>
            <th>№ Запроса</th>
            <th>Статус Этапа</th>
            <th>Категория</th>
            <th>Ответственный</th>
            <th>Факт Предв. Анализ (ч.д)</th>
            <th>План Оконч. Анализ (дн)</th>
            <th>Факт Оконч. Анализ (ч.д)</th>
            <th>План Разработка (дн)</th>
            <th>Факт Разработка (ч.д)</th>
            <th>План Приемка (дн)</th>
            <th>Факт Приемка (ч.д)</th>
            <th>План Стабилизация (дн)</th>
            <th>Факт Стабилизация (ч.д)</th>
            <th>Итого План (дн)</th>
            <th>Итого Факт (ч.д)</th>
          </tr>
          <tr>
            <td>#${taskData.id}</td>
            <td>${taskData.stageTitle}</td>
            <td>${taskData.category || 'Запрос на доработку ЛПО (new)'}</td>
            <td>${taskData.assignee || 'Грошев Дмитрий'}</td>
            <td class="num">${taskData.factPrelimAnalysisDays}</td>
            <td class="num">${taskData.planAnalysisDays}</td>
            <td class="num">${taskData.factFinalAnalysisDays}</td>
            <td class="num">${taskData.planDevDays}</td>
            <td class="num">${taskData.factDevDays}</td>
            <td class="num">${taskData.factAcceptanceDays}</td>
            <td class="num">${taskData.planAcceptanceDays}</td>
            <td class="num">${taskData.planStabilizationDays}</td>
            <td class="num">${taskData.factStabilizationDays}</td>
            <td class="num">${taskData.planTotalDays}</td>
            <td class="num">${taskData.factTotalDays}</td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `План_Факт_Запрос_${taskData.id}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function copyForNotion() {
    parseTrackStudioAutoFetchPlan();

    const po = taskData.details.po;
    const oa = taskData.details.oa;

    const reportText = `📋 **План-Факт по Запросу #${taskData.id}** («П-Ф по запросу» v7.6)
- **Статус этапа:** ${taskData.stageTitle}
- **Ответственный:** ${taskData.assignee || 'Грошев Дмитрий'}
- 🔍 **Предв. анализ (ПО):** План 3.0 дн. / Факт ${taskData.factPrelimAnalysisDays} ч.д.
- 🔎 **Оконч. анализ (ОА):** План ${taskData.planAnalysisDays} дн. / Факт ${taskData.factFinalAnalysisDays} ч.д.
- 💻 **Разработка:** План ${taskData.planDevDays} дн. / Факт ${taskData.factDevDays} ч.д.
- 🏛️ **Приемка & Стабилизация:** План ${taskData.planAcceptanceDays + taskData.planStabilizationDays} дн. / Факт ${taskData.factAcceptanceDays + taskData.factStabilizationDays} ч.д.
- 💼 **Управление:** План ${taskData.planManagementDays} дн. / Факт ${taskData.factManagementDays} ч.д.
- 📈 **Итого:** План ${taskData.planTotalDays} дн. / Факт ${taskData.factTotalDays} ч.д.
- **Ссылка в TS:** ${window.location.href}`;

    navigator.clipboard.writeText(reportText).then(() => {
      alert('✅ Отчет "П-Ф по запросу" скопирован в буфер обмена!');
    });
  }

  function toggleWidget() {
    isVisible = !isVisible;
    initWidget();
  }

  // Слушатель сообщений от background.js (Service Worker) при клике на иконку расширения
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "toggle_widget" || request.action === "toggleWidget") {
        toggleWidget();
        if (sendResponse) sendResponse({ status: "success", isVisible: isVisible });
      }
    });
  }

  // Плавающая кнопка-триггер на самой странице TrackStudio (для удобного открытия в 1 клик)
  function injectFloatingTrigger() {
    if (!isTaskPage()) return;
    if (document.getElementById('cyberos-ts-floating-trigger')) return;

    const btn = document.createElement('button');
    btn.id = 'cyberos-ts-floating-trigger';
    btn.innerHTML = '⚡ П-Ф по запросу';
    btn.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:999999; background:#0284c7; color:#ffffff; border:none; padding:8px 14px; border-radius:20px; font-weight:bold; font-size:12px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-family:sans-serif; transition:transform 0.2s;';
    btn.addEventListener('mouseover', () => btn.style.transform = 'scale(1.05)');
    btn.addEventListener('mouseout', () => btn.style.transform = 'scale(1.0)');
    btn.addEventListener('click', () => {
      toggleWidget();
    });
    document.body.appendChild(btn);
  }

  // При загрузке страницы добавляем плавающую кнопку-триггер
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFloatingTrigger);
  } else {
    injectFloatingTrigger();
  }
})();
