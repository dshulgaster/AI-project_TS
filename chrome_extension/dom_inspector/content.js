(() => {
  const PANEL_ID = 'trackstudio-dom-inspector';
  const MAX_NODES = 300;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'toggleInspector') {
      togglePanel();
    }
  });

  function togglePanel() {
    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel) {
      existingPanel.remove();
      return;
    }

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: '2147483647',
      width: '300px',
      padding: '16px',
      color: '#f8fafc',
      background: '#111827',
      border: '1px solid #64748b',
      borderRadius: '8px',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
      font: '14px/1.4 sans-serif'
    });
    const shadowRoot = panel.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        .panel { color: #f8fafc; background: #111827; font: 14px/1.4 Arial, sans-serif; }
        strong, p, output { display: block; color: #f8fafc; }
        p { margin: 8px 0 12px; }
        output { min-height: 20px; margin-top: 10px; color: #cbd5e1; }
        button { display: block; width: 100%; margin-top: 8px; padding: 9px 10px;
          color: #111827; background: #f8fafc; border: 1px solid #cbd5e1;
          border-radius: 4px; font: inherit; cursor: pointer; }
        button:hover { background: #dbeafe; }
        button:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
      </style>
      <div class="panel">
        <strong>TrackStudio DOM Inspector</strong>
        <p>Собирает только техническую структуру страницы.</p>
        <button type="button" data-action="scan">Сканировать и скачать JSON</button>
        <button type="button" data-action="ag-grid">Диагностировать AG Grid</button>
        <button type="button" data-action="probe">Проверить раскрытие кнопок</button>
        <button type="button" data-action="row-controls">Сканировать контролы строк</button>
        <button type="button" data-action="close">Закрыть</button>
        <output data-role="status" aria-live="polite"></output>
      </div>
    `;
    shadowRoot.querySelector('[data-action="scan"]').addEventListener('click', () => {
      const status = shadowRoot.querySelector('[data-role="status"]');
      try {
        const report = collectReport();
        downloadReport(report);
        status.textContent = `Готово: ${report.summary.candidateRows} строк.`;
      } catch (error) {
        console.error('Ошибка инспекции DOM:', error);
        status.textContent = 'Не удалось собрать отчет. Подробности в Console.';
      }
    });
    shadowRoot.querySelector('[data-action="probe"]').addEventListener('click', async () => {
      const status = shadowRoot.querySelector('[data-role="status"]');
      status.textContent = 'Проверяю кнопки раскрытия...';
      try {
        const report = await probeExpanders();
        downloadReport(report);
        status.textContent = `Готово: проверено ${report.probes.length} кнопок.`;
      } catch (error) {
        console.error('Ошибка проверки раскрытия:', error);
        status.textContent = 'Не удалось проверить раскрытие. Подробности в Console.';
      }
    });
    shadowRoot.querySelector('[data-action="ag-grid"]').addEventListener('click', () => {
      const status = shadowRoot.querySelector('[data-role="status"]');
      try {
        const report = collectAgGridReport();
        downloadReport(report);
        status.textContent = `Готово: найдено ${report.summary.grids} AG Grid.`;
      } catch (error) {
        console.error('Ошибка диагностики AG Grid:', error);
        status.textContent = 'Не удалось диагностировать AG Grid. Подробности в Console.';
      }
    });
    shadowRoot.querySelector('[data-action="row-controls"]').addEventListener('click', () => {
      const status = shadowRoot.querySelector('[data-role="status"]');
      try {
        const report = collectRowControlReport();
        downloadReport(report);
        status.textContent = `Готово: ${report.rows.length} строк-кандидатов.`;
      } catch (error) {
        console.error('Ошибка сканирования контролов строк:', error);
        status.textContent = 'Не удалось просканировать строки. Подробности в Console.';
      }
    });
    shadowRoot.querySelector('[data-action="close"]').addEventListener('click', () => panel.remove());
    document.documentElement.append(panel);
  }

  function collectReport() {
    const rows = getVisibleRows().map((row, index) => describeNode(row, index));
    const expanders = getCandidateExpanders().map((node, index) => describeExpander(node, index));

    return {
      reportVersion: '0.1.0',
      reportType: 'structure',
      createdAt: new Date().toISOString(),
      page: {
        urlPath: location.pathname,
        taskId: location.pathname.match(/task\/(\d+)/i)?.[1] || null
      },
      summary: {
        visibleRows: rows.length,
        candidateRows: rows.filter((row) => row.isCandidateRow).length,
        candidateExpanders: expanders.length,
        bodyTextLength: document.body?.innerText.length || 0
      },
      rows,
      expanders,
      containers: describeContainers()
    };
  }

  async function probeExpanders() {
    const probes = [];
    const candidates = [...document.querySelectorAll('button[aria-expanded="false"]')]
      .filter(isVisible)
      .slice(0, 20);

    for (const [index, node] of candidates.entries()) {
      const before = getDomSnapshot();
      const beforeState = describeExpander(node, index);
      let clickCompleted = false;
      let restored = false;

      try {
        node.click();
        clickCompleted = true;
        await waitForDomSettled();
      } catch (error) {
        console.error('Ошибка клика по кандидату раскрытия:', error);
      }

      const after = getDomSnapshot();
      const afterState = node.isConnected ? describeExpander(node, index) : null;
      const changed = JSON.stringify(before) !== JSON.stringify(after);

      if (node.isConnected && node.getAttribute('aria-expanded') !== beforeState.ariaExpanded) {
        node.click();
        await waitForDomSettled();
        restored = true;
      }

      probes.push({
        index,
        control: beforeState,
        before,
        after,
        afterControl: afterState,
        clickCompleted,
        domChanged: changed,
        restored
      });
    }

    return {
      reportVersion: '0.2.0',
      reportType: 'expansion-probe',
      createdAt: new Date().toISOString(),
      page: {
        urlPath: location.pathname,
        taskId: location.pathname.match(/task\/(\d+)/i)?.[1] || null
      },
      probes
    };
  }

  function getVisibleRows() {
    return [...document.querySelectorAll('tr, div.treeTable-row')]
      .filter(isVisible)
      .slice(0, MAX_NODES);
  }

  function getCandidateExpanders() {
    return [...document.querySelectorAll('button, a, [role="button"]')]
      .filter(isVisible)
      .map((node) => ({ node, description: describeExpander(node, 0) }))
      .filter(({ description }) => description.isCandidate)
      .slice(0, MAX_NODES)
      .map(({ node }) => node);
  }

  function getDomSnapshot() {
    return {
      visibleRows: getVisibleRows().map((row, index) => describeNode(row, index)),
      candidateExpanders: getCandidateExpanders().map((node, index) => describeExpander(node, index)),
      containers: describeContainers()
    };
  }

  function collectRowControlReport() {
    const rows = getVisibleRows()
      .map((row, index) => ({ row, description: describeNode(row, index) }))
      .filter(({ description }) => description.isCandidateRow)
      .map(({ row, description }, index) => ({
        rowIndex: description.index,
        row: description,
        controls: getRowControls(row).map((node, controlIndex) =>
          describeRowControl(node, controlIndex, description.index)),
        candidateIndex: index
      }));

    return {
      reportVersion: '0.3.0',
      reportType: 'row-controls',
      createdAt: new Date().toISOString(),
      page: {
        urlPath: location.pathname,
        taskId: location.pathname.match(/task\/(\d+)/i)?.[1] || null
      },
      summary: {
        visibleRows: getVisibleRows().length,
        candidateRows: rows.length,
        rowsWithControls: rows.filter((item) => item.controls.length > 0).length,
        controls: rows.reduce((total, item) => total + item.controls.length, 0)
      },
      rows
    };
  }

  function collectAgGridReport() {
    const grids = [...document.querySelectorAll('.ag-root, [class*="ag-root"], [role="grid"]')]
      .filter(isVisible)
      .slice(0, 20)
      .map((grid, gridIndex) => describeAgGrid(grid, gridIndex));

    return {
      reportVersion: '0.4.0',
      reportType: 'ag-grid',
      createdAt: new Date().toISOString(),
      page: {
        urlPath: location.pathname,
        taskId: location.pathname.match(/task\/(\d+)/i)?.[1] || null
      },
      summary: {
        grids: grids.length,
        rows: grids.reduce((total, grid) => total + grid.rows.length, 0),
        groupRows: grids.reduce((total, grid) => total + grid.groupRows, 0),
        expandedGroups: grids.reduce((total, grid) => total + grid.expandedGroups, 0),
        contractedGroups: grids.reduce((total, grid) => total + grid.contractedGroups, 0)
      },
      grids
    };
  }

  function describeAgGrid(grid, gridIndex) {
    const rows = [...grid.querySelectorAll(':scope .ag-row, :scope [role="row"]')]
      .filter(isVisible)
      .slice(0, MAX_NODES)
      .map((row, rowIndex) => describeAgGridRow(row, rowIndex));
    const groupRows = rows.filter((row) => row.groupState !== 'none');

    return {
      gridIndex,
      tag: grid.tagName.toLowerCase(),
      id: grid.id || null,
      classes: [...grid.classList].slice(0, 30),
      role: grid.getAttribute('role'),
      rect: describeRect(grid),
      rowCount: rows.length,
      groupRows: groupRows.length,
      expandedGroups: groupRows.filter((row) => row.groupState === 'expanded').length,
      contractedGroups: groupRows.filter((row) => row.groupState === 'contracted').length,
      rows
    };
  }

  function describeAgGridRow(row, rowIndex) {
    const classes = [...row.classList];
    const cells = [...row.querySelectorAll(':scope .ag-cell, :scope [role="gridcell"]')]
      .filter(isVisible)
      .slice(0, 50)
      .map((cell, cellIndex) => describeAgGridCell(cell, cellIndex));
    const groupState = classes.some((name) => /group-expanded/i.test(name)) ? 'expanded' :
      classes.some((name) => /group-contracted/i.test(name)) ? 'contracted' : 'none';

    return {
      rowIndex,
      agRowIndex: row.getAttribute('row-index'),
      id: row.id || null,
      classes: classes.slice(0, 30),
      role: row.getAttribute('role'),
      level: classes.find((name) => /^ag-row-level-\d+$/.test(name)) || null,
      position: classes.find((name) => /^ag-row-position-/.test(name)) || null,
      groupState,
      rect: describeRect(row),
      cells
    };
  }

  function describeAgGridCell(cell, cellIndex) {
    const classes = [...cell.classList];
    const descendants = [...cell.querySelectorAll('*')]
      .filter((node) => isVisible(node))
      .filter((node) => /group|tree|expand|contract|toggle/i.test(`${node.className} ${node.getAttribute('aria-label') || ''}`))
      .slice(0, 20)
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        classes: typeof node.className === 'string' ? node.className.split(/\s+/).slice(0, 20) : [],
        role: node.getAttribute('role'),
        ariaExpanded: node.getAttribute('aria-expanded'),
        ariaControls: node.getAttribute('aria-controls'),
        titlePresent: node.hasAttribute('title'),
        rect: describeRect(node)
      }));

    return {
      cellIndex,
      colId: cell.getAttribute('col-id'),
      classes: classes.slice(0, 30),
      role: cell.getAttribute('role'),
      textFingerprint: getTextFingerprint(cell.textContent || ''),
      descendants
    };
  }

  function getTextFingerprint(value) {
    const text = normalizeText(value);
    return {
      length: text.length,
      startsWithTaskNumber: /^#?\d{5,}/.test(text),
      containsWorklogPattern: /\d+(?:[.,]\d+)?\s*(?:ч\.?|ч\.д\.?|час)/i.test(text),
      containsAggregatePattern: /\d+\s*\/\s*\d+/.test(text),
      containsDatePattern: /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(text)
    };
  }

  function describeRect(node) {
    const rect = node.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function getRowControls(row) {
    const controls = [...row.querySelectorAll('button, a, [role="button"], [aria-expanded], [tabindex]')]
      .filter(isVisible);
    return [...new Set(controls)];
  }

  function describeRowControl(node, index, rowIndex) {
    const rect = node.getBoundingClientRect();
    const parent = node.parentElement;
    const href = node.getAttribute('href');
    const label = node.getAttribute('aria-label') || node.title || '';

    return {
      index,
      rowIndex,
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      classes: [...node.classList].slice(0, 20),
      role: node.getAttribute('role'),
      ariaExpanded: node.getAttribute('aria-expanded'),
      ariaControls: node.getAttribute('aria-controls'),
      ariaLabelLength: label.length,
      titlePresent: node.hasAttribute('title'),
      hrefPath: href ? getHrefPath(node) : null,
      hrefLength: href?.length || 0,
      hasOnclick: node.hasAttribute('onclick'),
      onclickLength: node.getAttribute('onclick')?.length || 0,
      tabIndex: node.getAttribute('tabindex'),
      dataAttributes: getDataAttributes(node),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      parent: {
        tag: parent?.tagName.toLowerCase() || null,
        classes: parent ? [...parent.classList].slice(0, 20) : [],
        role: parent?.getAttribute('role') || null
      }
    };
  }

  function describeNode(node, index) {
    const text = normalizeText(node.textContent || '');
    return {
      index,
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      classes: [...node.classList].slice(0, 20),
      role: node.getAttribute('role'),
      dataAttributes: getDataAttributes(node),
      childCount: node.children.length,
      depthHint: getDepthHint(node),
      textFingerprint: {
        length: text.length,
        startsWithTaskNumber: /^#?\d{5,}/.test(text),
        containsWorklogPattern: /\d+(?:[.,]\d+)?\s*(?:ч\.?|ч\.д\.?|час)/i.test(text),
        containsAggregatePattern: /\d+\s*\/\s*\d+/.test(text),
        containsDatePattern: /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(text)
      },
      isCandidateRow: /#?\d{5,}/.test(text) || /\d+\s*\/\s*\d+/.test(text)
    };
  }

  function describeExpander(node, index) {
    const label = normalizeText(node.getAttribute('aria-label') || node.title || node.textContent || '');
    const classText = [...node.classList].join(' ');
    return {
      index,
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      classes: [...node.classList].slice(0, 20),
      ariaExpanded: node.getAttribute('aria-expanded'),
      ariaControls: node.getAttribute('aria-controls'),
      hrefPath: getHrefPath(node),
      hasOnclick: node.hasAttribute('onclick'),
      onclickLength: node.getAttribute('onclick')?.length || 0,
      rowContext: describeRowContext(node),
      dataAttributes: getDataAttributes(node),
      labelFingerprint: {
        length: label.length
      },
      isCandidate: node.hasAttribute('aria-expanded') ||
        /expand|collapse| раскры| сверн| tree|toggle/i.test(`${label} ${classText}`)
    };
  }

  function describeRowContext(node) {
    const row = node.closest('tr, div.treeTable-row');
    const container = node.closest('[role="tree"], [role="grid"], table, [class*="tree"], [class*="task"]');
    const rows = [...document.querySelectorAll('tr, div.treeTable-row')];

    return {
      rowIndex: row ? rows.indexOf(row) : null,
      rowTag: row?.tagName.toLowerCase() || null,
      rowClasses: row ? [...row.classList].slice(0, 20) : [],
      containerTag: container?.tagName.toLowerCase() || null,
      containerId: container?.id || null,
      containerClasses: container ? [...container.classList].slice(0, 20) : [],
      containerRole: container?.getAttribute('role') || null
    };
  }

  function getHrefPath(node) {
    const href = node.getAttribute('href');
    if (!href) {
      return null;
    }

    try {
      return new URL(href, location.href).pathname;
    } catch (error) {
      return '[invalid-href]';
    }
  }

  function describeContainers() {
    return [...document.querySelectorAll('table, [role="tree"], [role="grid"], [class*="tree"], [class*="task"]')]
      .filter(isVisible)
      .slice(0, 100)
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        classes: [...node.classList].slice(0, 20),
        role: node.getAttribute('role'),
        childCount: node.children.length
      }));
  }

  function getDataAttributes(node) {
    return Object.keys(node.dataset).slice(0, 20).reduce((result, key) => {
      result[key] = '[present]';
      return result;
    }, {});
  }

  function getDepthHint(node) {
    const value = node.getAttribute('aria-level') || node.dataset.level || node.dataset.depth;
    return value || null;
  }

  function normalizeText(value) {
    return value.replace(/\s+/g, ' ').trim();
  }

  function downloadReport(report) {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const taskId = report.page.taskId || 'unknown';
    link.href = url;
    const suffix = report.reportType === 'expansion-probe' ? 'expansion-probe' :
      report.reportType === 'ag-grid' ? 'ag-grid' :
        report.reportType === 'row-controls' ? 'row-controls' : 'structure';
    link.download = `trackstudio-dom-report-${taskId}-${suffix}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function isVisible(node) {
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }

  function waitForDomSettled(timeout = 1000) {
    return new Promise((resolve) => {
      let settleTimer;
      const observer = new MutationObserver(() => {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(done, 150);
      });

      function done() {
        observer.disconnect();
        clearTimeout(settleTimer);
        resolve();
      }

      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['aria-expanded', 'class'],
        childList: true,
        subtree: true
      });
      settleTimer = setTimeout(done, timeout);
    });
  }
})();