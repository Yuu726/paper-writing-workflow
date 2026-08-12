(() => {
  "use strict";

  const data = window.WORKFLOW_DATA;
  if (!data || !Array.isArray(data.stages)) {
    document.body.innerHTML = "<p style='padding:2rem'>工作流数据加载失败。</p>";
    return;
  }

  const workflow = document.querySelector("#workflow");
  const stageNav = document.querySelector("#stage-nav");
  const searchInput = document.querySelector("#workflow-search");
  const searchStatus = document.querySelector("#search-status");
  const toggleAllButton = document.querySelector("#toggle-all");
  const progressLabel = document.querySelector("#progress-label");
  const progressBar = document.querySelector("#progress-bar");
  const toast = document.querySelector("#toast");
  const copyRegistry = new Map();
  let copySequence = 0;
  let toastTimer;

  const copyIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="1"></rect>
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path>
    </svg>`;

  const chevronIcon = `
    <svg class="sheet-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5"></path>
    </svg>`;

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
  }

  function parseRef(ref) {
    const match = /^([A-Z]+)(\d+)$/.exec(ref);
    return match ? { col: match[1], row: Number(match[2]) } : { col: "", row: 0 };
  }

  function groupBy(cells, keyFn) {
    const result = new Map();
    cells.forEach((cell) => {
      const key = keyFn(cell);
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(cell);
    });
    return result;
  }

  function titleWithoutPrefix(title) {
    const parts = title.split("｜");
    return parts.length > 1 ? parts.slice(1).join("｜") : title;
  }

  function conciseLabel(value, fallback = "完整内容") {
    const firstLine = String(value || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^[#*\-=\s]+|[#*\-=\s]+$/g, "").replace(/\s+/g, " ").trim())
      .find(Boolean);
    if (!firstLine) return fallback;
    return firstLine.length > 25 ? `${firstLine.slice(0, 25)}…` : firstLine;
  }

  function setOutlineTarget(element, sheet, index, label) {
    element.id = `${sheet.id}-item-${index}`;
    element.dataset.outlineLabel = label;
    element.dataset.outlineSheet = sheet.id;
    return element;
  }

  function createCard(cell, label = "原始内容", options = {}) {
    const card = document.createElement("article");
    card.className = "content-card";
    if (options.compact) card.classList.add("compact");
    if (options.structural) card.classList.add("structural-card");
    if (cell.value.length > 1800) card.classList.add("long-text");
    card.dataset.search = normalize(`${cell.ref} ${label} ${cell.value}`);
    card.dataset.cellRef = cell.ref;
    if (options.outline) {
      setOutlineTarget(card, options.outline.sheet, options.outline.index, options.outline.label);
    }

    const toolbar = document.createElement("div");
    toolbar.className = "card-toolbar";

    const ref = document.createElement("span");
    ref.className = "cell-ref";
    ref.textContent = cell.ref;

    const fieldLabel = document.createElement("span");
    fieldLabel.className = "field-label";
    fieldLabel.textContent = label;
    fieldLabel.title = label;

    const key = `copy-${++copySequence}`;
    copyRegistry.set(key, cell.value);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.dataset.copyKey = key;
    button.setAttribute("aria-label", `复制 ${cell.ref} 原文`);
    button.innerHTML = `${copyIcon}<span>复制</span>`;

    toolbar.append(ref, fieldLabel);

    const text = document.createElement("pre");
    text.className = "card-text";
    text.textContent = cell.value;

    if (options.structural) {
      toolbar.append(text, button);
      card.append(toolbar);
    } else {
      toolbar.append(button);
      card.append(toolbar, text);
    }
    return card;
  }

  function createList(cards) {
    const list = document.createElement("div");
    list.className = "content-list";
    cards.forEach((card) => list.append(card));
    return list;
  }

  function createGroup(title, meta, cards, options = {}) {
    const group = document.createElement("section");
    group.className = "content-group";
    group.dataset.filterGroup = "true";
    if (options.outline) {
      setOutlineTarget(group, options.outline.sheet, options.outline.index, options.outline.label);
    }

    const heading = document.createElement("h4");
    heading.className = "group-heading";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = title;
    const small = document.createElement("small");
    small.textContent = meta;
    heading.append(titleSpan, small);
    group.append(heading);
    if (options.contextCards?.length) {
      const context = document.createElement("div");
      context.className = "source-context";
      options.contextCards.forEach((card) => context.append(card));
      group.append(context);
    }
    if (cards.length) group.append(createList(cards));
    return group;
  }

  function createStructureIndex(title, cells, labelForCell) {
    const details = document.createElement("details");
    details.className = "field-index";
    details.dataset.filterGroup = "true";
    const summary = document.createElement("summary");
    summary.textContent = `${title} · ${cells.length} 项`;
    const strip = document.createElement("div");
    strip.className = "source-context source-context-index";
    cells.forEach((cell) => {
      strip.append(createCard(cell, labelForCell(cell), { compact: true, structural: true }));
    });
    details.append(summary, strip);
    return details;
  }

  function renderSingle(sheet) {
    return createList(sheet.cells.map((cell, index) => createCard(cell, "原表内容", {
      compact: cell.value.length < 90 && !cell.value.includes("\n"),
      outline: {
        sheet,
        index: index + 1,
        label: sheet.cells.length === 1 ? "完整内容" : conciseLabel(cell.value, `内容 ${index + 1}`),
      },
    })));
  }

  function renderSteps(sheet) {
    const fragment = document.createDocumentFragment();
    const rows = groupBy(sheet.cells, (cell) => parseRef(cell.ref).row);
    rows.forEach((cells, row) => {
      const aCell = cells.find((cell) => parseRef(cell.ref).col === "A");
      const title = aCell ? aCell.value.replace(/\s+/g, " ").trim() : `原表第 ${row} 行`;
      const contextCards = aCell
        ? [createCard(aCell, "步骤名称", { compact: true, structural: true })]
        : [];
      const cards = cells
        .filter((cell) => cell !== aCell)
        .map((cell) => createCard(cell, "步骤内容"));
      fragment.append(createGroup(title, `步骤 ${String(row).padStart(2, "0")}`, cards, {
        contextCards,
        outline: { sheet, index: row, label: title },
      }));
    });
    return fragment;
  }

  function renderPromptGrid(sheet) {
    const fragment = document.createDocumentFragment();
    const columns = groupBy(sheet.cells, (cell) => parseRef(cell.ref).col);
    columns.forEach((cells, col) => {
      const header = cells.find((cell) => parseRef(cell.ref).row === 1);
      const title = header ? header.value.replace(/\s+/g, " ").trim() : `原表列 ${col}`;
      const contextCards = header
        ? [createCard(header, "栏目标题", { compact: true, structural: true })]
        : [];
      const cards = cells
        .filter((cell) => cell !== header)
        .map((cell) => createCard(cell, title));
      fragment.append(createGroup(title, `提示词列 ${col}`, cards, {
        contextCards,
        outline: { sheet, index: col, label: title },
      }));
    });
    return fragment;
  }

  function renderMatrix(sheet) {
    const fragment = document.createDocumentFragment();
    const fields = new Map();
    const fieldCells = sheet.cells.filter((cell) => {
      const ref = parseRef(cell.ref);
      if (ref.col !== "A") return false;
      fields.set(ref.row, cell.value);
      return true;
    });

    if (fieldCells.length) {
      fragment.append(createStructureIndex("正式字段说明（展开查看）", fieldCells, () => "字段标签"));
    }

    const projectCells = sheet.cells.filter((cell) => parseRef(cell.ref).col !== "A");
    const columns = groupBy(projectCells, (cell) => parseRef(cell.ref).col);
    columns.forEach((cells, col) => {
      const header = cells.find((cell) => parseRef(cell.ref).row === 1);
      const title = header ? header.value.replace(/\s+/g, " ").trim() : `原表项目列 ${col}`;
      const contextCards = header
        ? [createCard(header, "案例名称", { compact: true, structural: true })]
        : [];
      const cards = cells.filter((cell) => cell !== header).map((cell) => {
        const ref = parseRef(cell.ref);
        const label = fields.get(ref.row) || `补充内容（第 ${ref.row} 行）`;
        return createCard(cell, label);
      });
      fragment.append(createGroup(title, `参考案例列 ${col}`, cards, {
        contextCards,
        outline: { sheet, index: col, label: `参考案例｜${title}` },
      }));
    });
    return fragment;
  }

  function renderRecords(sheet) {
    const fragment = document.createDocumentFragment();
    const headers = new Map();
    const headerCells = sheet.cells.filter((cell) => {
      const ref = parseRef(cell.ref);
      if (ref.row !== 1) return false;
      headers.set(ref.col, cell.value);
      return true;
    });

    if (headerCells.length) {
      fragment.append(createStructureIndex("字段说明（展开查看）", headerCells, () => "字段名称"));
    }

    const recordCells = sheet.cells.filter((cell) => parseRef(cell.ref).row !== 1);
    const rows = groupBy(recordCells, (cell) => parseRef(cell.ref).row);
    rows.forEach((cells, row) => {
      const identityCells = cells
        .filter((cell) => ["A", "B"].includes(parseRef(cell.ref).col))
      const seen = new Set();
      const lead = identityCells
        .map((cell) => cell.value.replace(/\s+/g, " ").trim())
        .filter((value) => value && !seen.has(value) && seen.add(value))
        .join(" · ");
      const contextCards = identityCells.map((cell) => {
        const col = parseRef(cell.ref).col;
        return createCard(cell, headers.get(col) || `原表列 ${col}`, { compact: true, structural: true });
      });
      const cards = cells.filter((cell) => !identityCells.includes(cell)).map((cell) => {
        const col = parseRef(cell.ref).col;
        return createCard(cell, headers.get(col) || `原表列 ${col}`);
      });
      const recordTitle = lead || `原表第 ${row} 行`;
      fragment.append(createGroup(recordTitle, `记录 ${String(row).padStart(2, "0")}`, cards, {
        contextCards,
        outline: { sheet, index: row, label: recordTitle },
      }));
    });
    return fragment;
  }

  const renderers = {
    single: renderSingle,
    steps: renderSteps,
    prompt_grid: renderPromptGrid,
    matrix: renderMatrix,
    records: renderRecords,
  };

  const guides = {
    single: "以下内容按原表单元格顺序展开；每个复制按钮仅复制对应单元格原文。",
    steps: "步骤名称作为章节标题和紧凑来源条呈现，真正的操作内容保留为正文卡片；两者均可独立复制。",
    prompt_grid: "列标题只作为章节层级和紧凑来源条呈现，提示词正文独立成卡片并可一键复制。",
    matrix: "A 列收进可折叠的正式字段说明；每个项目列作为参考案例独立展示，避免把案例误认为模板。",
    records: "章、节与段落名称组成自然的章节层级；原表字段收进折叠说明，模板正文仍按原单元格保留并可复制。",
  };

  function createSheet(sheet, index, stage) {
    const details = document.createElement("details");
    details.className = "sheet";
    details.id = sheet.id;
    details.open = true;
    details.dataset.search = normalize(`${stage.title} ${stage.purpose} ${sheet.book} ${sheet.bookFile} ${sheet.name}`);

    const summary = document.createElement("summary");
    const number = document.createElement("span");
    number.className = "sheet-number";
    number.textContent = String(index).padStart(2, "0");

    const titleWrap = document.createElement("div");
    titleWrap.className = "sheet-title-wrap";
    const title = document.createElement("h3");
    title.className = "sheet-title";
    title.textContent = sheet.name;
    const source = document.createElement("p");
    source.className = "sheet-source";
    source.textContent = `来源：${sheet.bookFile} · 工作表：${sheet.name}`;
    titleWrap.append(title, source);

    const count = document.createElement("span");
    count.className = "sheet-cell-count";
    count.textContent = `${sheet.cells.length} 个内容块`;
    summary.append(number, titleWrap, count);
    summary.insertAdjacentHTML("beforeend", chevronIcon);

    const body = document.createElement("div");
    body.className = "sheet-body";
    const guide = document.createElement("p");
    guide.className = "sheet-guide";
    guide.textContent = guides[sheet.renderer];
    body.append(guide, renderers[sheet.renderer](sheet));

    details.append(summary, body);
    return details;
  }

  function createStage(stage) {
    const section = document.createElement("section");
    section.className = "stage-section";
    section.id = stage.id;
    section.dataset.stage = stage.number;
    section.dataset.search = normalize(`${stage.title} ${stage.purpose}`);

    const heading = document.createElement("header");
    heading.className = "stage-heading";
    const index = document.createElement("div");
    index.className = "stage-index";
    index.textContent = `STAGE ${String(stage.number).padStart(2, "0")}`;
    const copy = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "stage-title";
    title.textContent = titleWithoutPrefix(stage.title);
    const purpose = document.createElement("p");
    purpose.className = "stage-purpose";
    purpose.textContent = stage.purpose;
    const count = document.createElement("span");
    count.className = "stage-count";
    count.textContent = `${stage.sheets.length} 个工作表 · ${stage.sheets.reduce((sum, sheet) => sum + sheet.cells.length, 0)} 个原文单元格`;
    copy.append(title, purpose, count);
    heading.append(index, copy);
    section.append(heading);
    stage.sheets.forEach((sheet, indexInStage) => section.append(createSheet(sheet, indexInStage + 1, stage)));
    return section;
  }

  function renderNavigation() {
    data.stages.forEach((stage) => {
      const item = document.createElement("div");
      item.className = "nav-stage";
      item.dataset.navStage = stage.number;

      const stageLink = document.createElement("a");
      stageLink.className = "nav-stage-link";
      stageLink.href = `#${stage.id}`;
      const number = document.createElement("span");
      number.className = "nav-number";
      number.textContent = String(stage.number).padStart(2, "0");
      const title = document.createElement("span");
      title.className = "nav-stage-title";
      title.textContent = titleWithoutPrefix(stage.title);
      stageLink.append(number, title);

      const sheets = document.createElement("div");
      sheets.className = "nav-sheets";
      stage.sheets.forEach((sheet) => {
        const sheetItem = document.createElement("div");
        sheetItem.className = "nav-sheet";
        sheetItem.dataset.navSheet = sheet.id;
        const link = document.createElement("a");
        link.className = "nav-sheet-link";
        link.href = `#${sheet.id}`;
        const outline = document.createElement("div");
        outline.className = "nav-outline";
        outline.setAttribute("aria-label", `${sheet.name}内部目录`);
        const outlineTargets = [...document.querySelectorAll(`[data-outline-sheet='${sheet.id}']`)];
        const sheetName = document.createElement("span");
        sheetName.className = "nav-sheet-name";
        sheetName.textContent = sheet.name;
        const sheetCount = document.createElement("span");
        sheetCount.className = "nav-sheet-count";
        sheetCount.textContent = outlineTargets.length;
        sheetCount.setAttribute("aria-label", `${outlineTargets.length} 个内部条目`);
        link.append(sheetName, sheetCount);
        outlineTargets.forEach((target, index) => {
          const item = document.createElement("a");
          item.className = "nav-outline-link";
          item.href = `#${target.id}`;
          item.textContent = target.dataset.outlineLabel;
          item.title = target.dataset.outlineLabel;
          item.dataset.outlineIndex = String(index + 1).padStart(2, "0");
          outline.append(item);
        });
        sheetItem.append(link, outline);
        sheets.append(sheetItem);
      });
      item.append(stageLink, sheets);
      stageNav.append(item);
    });
  }

  function renderStats() {
    const stats = [
      [data.meta.stageCount, "阶段"],
      [data.meta.sheetCount, "工作表"],
      [data.meta.cellCount, "原文单元格"],
    ];
    const container = document.querySelector("#hero-stats");
    stats.forEach(([value, label]) => {
      const stat = document.createElement("div");
      stat.className = "hero-stat";
      const strong = document.createElement("strong");
      strong.textContent = value;
      const span = document.createElement("span");
      span.textContent = label;
      stat.append(strong, span);
      container.append(stat);
    });
    document.querySelector("#sidebar-count").textContent = `${data.meta.stageCount} 阶段 · ${data.meta.sheetCount} 工作表`;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    const succeeded = document.execCommand("copy");
    textarea.remove();
    if (!succeeded) throw new Error("copy failed");
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
  }

  function updateToggleLabel() {
    const visibleSheets = [...document.querySelectorAll(".sheet:not([hidden])")];
    const anyOpen = visibleSheets.some((sheet) => sheet.open);
    toggleAllButton.textContent = anyOpen ? "收起全部" : "展开全部";
    toggleAllButton.dataset.action = anyOpen ? "collapse" : "expand";
  }

  function filterContent(query) {
    const normalizedQuery = normalize(query);
    let visibleCards = 0;

    document.querySelectorAll(".stage-section").forEach((stage) => {
      const stageContextMatch = normalizedQuery && stage.dataset.search.includes(normalizedQuery);
      let visibleSheets = 0;

      stage.querySelectorAll(":scope > .sheet").forEach((sheet) => {
        const sheetContextMatch = stageContextMatch || (normalizedQuery && sheet.dataset.search.includes(normalizedQuery));
        let sheetMatches = 0;

        sheet.querySelectorAll(".content-card").forEach((card) => {
          const matches = !normalizedQuery || sheetContextMatch || card.dataset.search.includes(normalizedQuery);
          card.hidden = !matches;
          card.classList.toggle("search-match", Boolean(normalizedQuery && matches && !sheetContextMatch));
          if (matches) {
            sheetMatches += 1;
            visibleCards += 1;
          }
        });

        sheet.querySelectorAll("[data-filter-group='true']").forEach((group) => {
          group.hidden = !group.querySelector(".content-card:not([hidden])");
          if (normalizedQuery && !group.hidden && group.tagName === "DETAILS") group.open = true;
        });

        sheet.hidden = sheetMatches === 0;
        if (!sheet.hidden) {
          visibleSheets += 1;
          if (normalizedQuery) sheet.open = true;
        }
      });

      stage.hidden = visibleSheets === 0;
    });

    if (normalizedQuery) {
      searchStatus.textContent = visibleCards
        ? `找到 ${visibleCards} 个匹配的原文单元格。`
        : "没有找到匹配内容，请尝试更短的关键词。";
    } else {
      searchStatus.textContent = "";
    }
    updateToggleLabel();
  }

  function setActiveStage(number) {
    document.querySelectorAll(".nav-stage").forEach((item) => {
      item.classList.toggle("active", Number(item.dataset.navStage) === number);
    });
    progressLabel.textContent = `${String(number).padStart(2, "0")} / ${String(data.meta.stageCount).padStart(2, "0")}`;
    progressBar.style.width = `${(number / data.meta.stageCount) * 100}%`;
  }

  function setActiveSheet(id) {
    const previous = document.querySelector(".nav-sheet.active")?.dataset.navSheet;
    document.querySelectorAll(".nav-sheet").forEach((item) => {
      const active = item.dataset.navSheet === id;
      item.classList.toggle("active", active);
      item.querySelector(".nav-sheet-link").classList.toggle("active", active);
    });
    if (id && previous !== id) setActiveOutline(null, id);
  }

  function setActiveOutline(id, sheetId = null) {
    document.querySelectorAll(".nav-outline-link").forEach((link) => {
      link.classList.toggle("active", Boolean(id) && link.getAttribute("href") === `#${id}`);
    });
    if (sheetId) {
      document.querySelectorAll(".nav-sheet").forEach((item) => {
        item.classList.toggle("active", item.dataset.navSheet === sheetId);
        item.querySelector(".nav-sheet-link").classList.toggle("active", item.dataset.navSheet === sheetId);
      });
    }
  }

  function revealOutlineTarget(target) {
    const sheet = target.closest(".sheet");
    if (sheet) sheet.open = true;
  }

  function outlineSheetId(target) {
    return target.dataset.outlineSheet || target.closest(".sheet")?.id || null;
  }

  function updateOutlineFromHash() {
    const hashTarget = location.hash && document.querySelector(location.hash);
    if (hashTarget?.dataset.outlineLabel) {
      revealOutlineTarget(hashTarget);
      setActiveOutline(hashTarget.id, outlineSheetId(hashTarget));
    }
  }

  function setupObservers() {
    const stageObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveStage(Number(visible.target.dataset.stage));
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: [0, 0.05, 0.2] },
    );
    document.querySelectorAll(".stage-section").forEach((stage) => stageObserver.observe(stage));

    const sheetObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActiveSheet(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    document.querySelectorAll(".sheet").forEach((sheet) => sheetObserver.observe(sheet));

    const outlineObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))[0];
        if (visible) setActiveOutline(visible.target.id, outlineSheetId(visible.target));
      },
      { rootMargin: "-16% 0px -72% 0px", threshold: [0, 0.05, 0.2] },
    );
    document.querySelectorAll("[data-outline-label]").forEach((target) => outlineObserver.observe(target));
  }

  function closeNavigation() {
    document.body.classList.remove("nav-open");
  }

  renderStats();
  data.stages.forEach((stage) => workflow.append(createStage(stage)));
  renderNavigation();
  setupObservers();
  setActiveStage(1);
  updateOutlineFromHash();
  updateToggleLabel();

  document.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-copy-key]");
    if (copyButton) {
      const text = copyRegistry.get(copyButton.dataset.copyKey);
      try {
        await copyText(text);
        copyButton.classList.add("copied");
        copyButton.querySelector("span").textContent = "已复制";
        showToast(`已复制 ${copyButton.closest(".content-card").dataset.cellRef} 的原文`);
        window.setTimeout(() => {
          copyButton.classList.remove("copied");
          copyButton.querySelector("span").textContent = "复制";
        }, 1500);
      } catch (error) {
        showToast("复制失败，请检查浏览器剪贴板权限");
      }
      return;
    }

    const anchor = event.target.closest("a[href^='#']");
    if (anchor) {
      const target = document.querySelector(anchor.getAttribute("href"));
      if (target?.classList.contains("sheet")) target.open = true;
      if (target?.dataset.outlineLabel) {
        revealOutlineTarget(target);
        setActiveOutline(target.id, outlineSheetId(target));
      }
      closeNavigation();
    }
  });

  searchInput.addEventListener("input", () => filterContent(searchInput.value));

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (event.key === "Escape") {
      if (document.activeElement === searchInput && searchInput.value) {
        searchInput.value = "";
        filterContent("");
      } else {
        closeNavigation();
      }
    }
  });

  toggleAllButton.addEventListener("click", () => {
    const shouldOpen = toggleAllButton.dataset.action === "expand";
    document.querySelectorAll(".sheet:not([hidden])").forEach((sheet) => {
      sheet.open = shouldOpen;
    });
    updateToggleLabel();
  });

  document.addEventListener("toggle", (event) => {
    if (event.target.classList?.contains("sheet")) updateToggleLabel();
  }, true);

  document.querySelector("#menu-button").addEventListener("click", () => document.body.classList.add("nav-open"));
  document.querySelector("#sidebar-close").addEventListener("click", closeNavigation);
  document.querySelector("#sidebar-scrim").addEventListener("click", closeNavigation);
})();
