(function () {
  "use strict";

  const state = {
    theme: "all",
    filter: "all",
    query: "",
    selectedId: null,
    mapMode: "fallback",
    fallbackZoom: 1,
    tmap: null,
    tmapMarkers: null,
    annotationMarkers: null,
    annotations: [],
    annotationMode: false,
    editingAnnotationId: null,
    pendingAnnotationCoordinate: null,
  };

  const elements = {
    searchInput: document.querySelector("#searchInput"),
    themeList: document.querySelector("#themeList"),
    resultList: document.querySelector("#resultList"),
    resultCount: document.querySelector("#resultCount"),
    resultTitle: document.querySelector("#resultTitle"),
    markers: document.querySelector("#fallbackMarkers"),
    fallbackMap: document.querySelector("#fallbackMap"),
    tencentMap: document.querySelector("#tencentMap"),
    layerBar: document.querySelector("#layerBar"),
    annotationButton: document.querySelector("#annotationButton"),
    annotationPanel: document.querySelector("#annotationPanel"),
    annotationCount: document.querySelector("#annotationCount"),
    annotationList: document.querySelector("#annotationList"),
    annotationNotice: document.querySelector("#annotationNotice"),
    annotationExport: document.querySelector("#annotationExport"),
    annotationCopy: document.querySelector("#annotationCopy"),
    annotationClear: document.querySelector("#annotationClear"),
    annotationEditor: document.querySelector("#annotationEditor"),
    annotationEditorTitle: document.querySelector("#annotationEditorTitle"),
    annotationForm: document.querySelector("#annotationForm"),
    annotationName: document.querySelector("#annotationName"),
    annotationCategory: document.querySelector("#annotationCategory"),
    annotationDescription: document.querySelector("#annotationDescription"),
    annotationCoordinate: document.querySelector("#annotationCoordinate"),
    annotationCancel: document.querySelector("#annotationCancel"),
    annotationFormCancel: document.querySelector("#annotationFormCancel"),
    detailPanel: document.querySelector("#detailPanel"),
    detailContent: document.querySelector("#detailContent"),
    agentDrawer: document.querySelector("#agentDrawer"),
    chatMessages: document.querySelector("#chatMessages"),
    promptSuggestions: document.querySelector("#promptSuggestions"),
    chatForm: document.querySelector("#chatForm"),
    chatInput: document.querySelector("#chatInput"),
    agentMode: document.querySelector("#agentMode"),
    guideModal: document.querySelector("#guideModal"),
    guideGallery: document.querySelector("#guideGallery"),
    sidebar: document.querySelector(".sidebar"),
    dataStatus: document.querySelector("#dataStatus"),
  };

  const themeById = Object.fromEntries(window.MAP_THEMES.map((theme) => [theme.id, theme]));
  const featureById = Object.fromEntries(window.MAP_FEATURES.map((feature) => [feature.id, feature]));
  const toTencentCoordinate = (latitude, longitude) => window.CampusCoordinates.wgs84ToGcj02(latitude, longitude);
  const sheetCategory = {
    "宿舍信息": "dorm", "食堂信息": "dining", "图书馆与学习设施": "study",
    "行政窗口": "office", "交通信息": "transport", "周边餐饮": "nearby",
    "周边商业服务": "service", "运动设施": "sports", "一卡通与生活服务": "service",
  };
  const annotationStorageKey = "seu-campus-map-annotations-v1";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]);
  }

  function normalize(value) {
    return String(value ?? "").toLowerCase().replace(/\s+/g, "");
  }

  function categoryColor(category) {
    return (themeById[category] || themeById.all).color;
  }

  function loadAnnotations() {
    try {
      const raw = window.localStorage.getItem(annotationStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      state.annotations = Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.name) : [];
    } catch (error) {
      state.annotations = [];
      console.warn("无法读取本地标注数据。", error);
    }
  }

  function persistAnnotations() {
    try {
      window.localStorage.setItem(annotationStorageKey, JSON.stringify(state.annotations));
    } catch (error) {
      setAnnotationNotice("浏览器未允许本地保存；仍可导出当前标注。", true);
      console.warn("无法保存本地标注数据。", error);
    }
  }

  function setAnnotationNotice(message, isWarning = false) {
    if (!elements.annotationNotice) return;
    elements.annotationNotice.textContent = message;
    elements.annotationNotice.style.color = isWarning ? "#a45b4f" : "";
  }

  function formatAnnotationCoordinate(annotation) {
    if (Number.isFinite(Number(annotation?.lat)) && Number.isFinite(Number(annotation?.lng))) {
      return `腾讯坐标 ${Number(annotation.lat).toFixed(6)}, ${Number(annotation.lng).toFixed(6)}`;
    }
    if (Number.isFinite(Number(annotation?.x)) && Number.isFinite(Number(annotation?.y))) {
      return `示意坐标 X ${Number(annotation.x).toFixed(2)}% · Y ${Number(annotation.y).toFixed(2)}%`;
    }
    return "坐标待补充";
  }

  function statusLabel(status) {
    if (status === "open") return "预计开放";
    if (status === "closed") return "预计关闭";
    return "待核验";
  }

  function renderThemes() {
    elements.themeList.innerHTML = window.MAP_THEMES.map((theme) => `
      <button class="theme-button ${state.theme === theme.id ? "active" : ""}" data-theme="${theme.id}" style="--theme-color:${theme.color}">
        <span class="theme-icon">${theme.icon}</span>
        <span>${theme.label}</span>
      </button>
    `).join("");
  }

  function renderLayerBar() {
    const layers = [
      { id: "all", label: "全部图层" }, { id: "study", label: "学习" },
      { id: "dorm", label: "宿舍" }, { id: "dining", label: "餐饮" },
      { id: "service", label: "服务" }, { id: "medical", label: "医疗" },
    ];
    elements.layerBar.innerHTML = layers.map((layer) => `
      <button class="layer-button ${state.theme === layer.id ? "active" : ""}" data-theme="${layer.id}">${layer.label}</button>
    `).join("");
  }

  function renderAnnotationPanel() {
    if (!elements.annotationPanel) return;
    elements.annotationPanel.hidden = !state.annotationMode;
    elements.annotationButton.classList.toggle("active", state.annotationMode);
    elements.annotationButton.textContent = state.annotationMode ? "退出标注" : "标注地图";
    elements.annotationCount.textContent = `${state.annotations.length} 个`;
    elements.annotationList.innerHTML = state.annotations.length ? state.annotations.map((annotation) => `
      <article class="annotation-item" data-annotation-row="${escapeHtml(annotation.id)}">
        <div>
          <strong>${escapeHtml(annotation.name)}</strong>
          <small>${escapeHtml(formatAnnotationCoordinate(annotation))}</small>
        </div>
        <div class="annotation-item-actions">
          <button type="button" data-annotation-edit="${escapeHtml(annotation.id)}" aria-label="编辑 ${escapeHtml(annotation.name)}">✎</button>
          <button type="button" data-annotation-delete="${escapeHtml(annotation.id)}" aria-label="删除 ${escapeHtml(annotation.name)}">×</button>
        </div>
      </article>
    `).join("") : `<div class="annotation-empty">还没有标注。开启后点击腾讯底图上的任意位置，即可添加第一个点。</div>`;
  }

  function annotationCoordinate(annotation) {
    if (Number.isFinite(Number(annotation?.lat)) && Number.isFinite(Number(annotation?.lng))) {
      return { lat: Number(annotation.lat), lng: Number(annotation.lng), coordinateSystem: annotation.coordinateSystem || "GCJ-02" };
    }
    if (Number.isFinite(Number(annotation?.x)) && Number.isFinite(Number(annotation?.y))) {
      return { x: Number(annotation.x), y: Number(annotation.y), coordinateSystem: annotation.coordinateSystem || "fallback-percent" };
    }
    return null;
  }

  function openAnnotationEditor(coordinate, annotationId = null) {
    if (!state.annotationMode || !elements.annotationEditor) return;
    const existing = annotationId ? state.annotations.find((item) => item.id === annotationId) : null;
    state.editingAnnotationId = existing?.id || null;
    state.pendingAnnotationCoordinate = coordinate || annotationCoordinate(existing);
    elements.annotationEditorTitle.textContent = existing ? "编辑地图点位" : "添加地图点位";
    elements.annotationName.value = existing?.name || "";
    elements.annotationCategory.value = existing?.category || "all";
    elements.annotationDescription.value = existing?.description || "";
    elements.annotationCoordinate.textContent = formatAnnotationCoordinate(state.pendingAnnotationCoordinate || {});
    elements.annotationEditor.hidden = false;
    window.setTimeout(() => elements.annotationName.focus(), 0);
  }

  function closeAnnotationEditor() {
    state.editingAnnotationId = null;
    state.pendingAnnotationCoordinate = null;
    if (elements.annotationEditor) elements.annotationEditor.hidden = true;
  }

  function saveAnnotation(event) {
    event.preventDefault();
    if (!elements.annotationName.value.trim()) {
      elements.annotationName.reportValidity();
      return;
    }
    const existing = state.editingAnnotationId ? state.annotations.find((item) => item.id === state.editingAnnotationId) : null;
    const coordinate = state.pendingAnnotationCoordinate || {};
    const now = new Date().toISOString();
    const annotation = {
      ...(existing || {}),
      id: existing?.id || `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: elements.annotationName.value.trim(),
      category: elements.annotationCategory.value || "all",
      icon: "标",
      description: elements.annotationDescription.value.trim() || "用户现场标注，详情待补充。",
      source: "user",
      updatedAt: now,
      createdAt: existing?.createdAt || now,
      ...(Number.isFinite(Number(coordinate.lat)) && Number.isFinite(Number(coordinate.lng)) ? {
        lat: Number(coordinate.lat),
        lng: Number(coordinate.lng),
        coordinateSystem: coordinate.coordinateSystem || "GCJ-02",
        x: undefined,
        y: undefined,
      } : {
        x: Number(coordinate.x),
        y: Number(coordinate.y),
        coordinateSystem: coordinate.coordinateSystem || "fallback-percent",
        lat: undefined,
        lng: undefined,
      }),
    };
    Object.keys(annotation).forEach((key) => annotation[key] === undefined && delete annotation[key]);
    state.annotations = existing
      ? state.annotations.map((item) => item.id === existing.id ? annotation : item)
      : [...state.annotations, annotation];
    persistAnnotations();
    closeAnnotationEditor();
    renderAnnotationPanel();
    renderMarkers();
    setAnnotationNotice(existing ? "点位已更新。" : "点位已保存，可继续点击地图添加。", false);
    updateAnnotationStatus();
  }

  function deleteAnnotation(id) {
    const annotation = state.annotations.find((item) => item.id === id);
    if (!annotation) return;
    state.annotations = state.annotations.filter((item) => item.id !== id);
    if (state.editingAnnotationId === id) closeAnnotationEditor();
    persistAnnotations();
    renderAnnotationPanel();
    renderMarkers();
    setAnnotationNotice(`已删除“${annotation.name}”。`);
    updateAnnotationStatus();
  }

  function annotationExportPayload() {
    return {
      schemaVersion: 1,
      campus: "东南大学四牌楼校区",
      mapProvider: state.mapMode === "tencent" ? "Tencent Maps GL JS" : "fallback schematic",
      coordinateSystem: state.mapMode === "tencent" ? "GCJ-02 (Tencent map click coordinates)" : "fallback-percent",
      exportedAt: new Date().toISOString(),
      existingMapFeatureCount: window.MAP_FEATURES.length,
      annotations: state.annotations.map((annotation) => ({ ...annotation })),
    };
  }

  function annotationJson() {
    return JSON.stringify(annotationExportPayload(), null, 2);
  }

  function downloadAnnotations() {
    const blob = new Blob([annotationJson()], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    link.href = url;
    link.download = `sipailou-map-annotations-${stamp}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setAnnotationNotice(`已导出 ${state.annotations.length} 个标注，请把 JSON 文件发回给我。`);
  }

  async function copyAnnotations() {
    const json = annotationJson();
    try {
      await navigator.clipboard.writeText(json);
      setAnnotationNotice("JSON 已复制到剪贴板，可直接粘贴回对话。", false);
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = json;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setAnnotationNotice("JSON 已复制，可直接粘贴回对话。", false);
    }
  }

  function updateAnnotationStatus() {
    if (!state.annotationMode || !elements.dataStatus) return;
    elements.dataStatus.textContent = `标注模式 · ${state.annotations.length} 个待回传`;
    elements.dataStatus.classList.remove("success");
    elements.dataStatus.classList.add("warning");
  }

  function toggleAnnotationMode() {
    state.annotationMode = !state.annotationMode;
    if (!state.annotationMode) closeAnnotationEditor();
    renderAnnotationPanel();
    renderMarkers();
    if (state.annotationMode) {
      updateAnnotationStatus();
      setAnnotationNotice("点击地图添加点位；点击列表中的 ✎ 可编辑。", false);
    } else {
      elements.dataStatus.textContent = state.mapMode === "tencent" ? "腾讯底图 · 数据待核准" : "演示数据 · 待核准";
      elements.dataStatus.classList.toggle("success", state.mapMode === "tencent");
      elements.dataStatus.classList.toggle("warning", state.mapMode !== "tencent");
    }
  }

  function recordAsKnowledge(record) {
    const raw = Object.entries(record.values || {})
      .filter(([, value]) => value !== null && value !== "" && value !== "-")
      .map(([key, value]) => `${key}：${value}`);
    return {
      id: record.id,
      name: record.title || record.sheet,
      category: sheetCategory[record.sheet] || "all",
      icon: "文",
      location: `指南数据 · ${record.sheet}`,
      hours: "以详情记录为准",
      status: "unknown",
      verified: false,
      tags: [record.sheet, "知识记录"],
      description: raw.join("；"),
      knowledgeOnly: true,
    };
  }

  function searchKnowledge() {
    if (!state.query || !window.GUIDE_DATA?.records?.length) return [];
    const query = normalize(state.query);
    return window.GUIDE_DATA.records
      .filter((record) => normalize(JSON.stringify(record)).includes(query))
      .slice(0, 20)
      .map(recordAsKnowledge);
  }

  function filteredFeatures() {
    const query = normalize(state.query);
    const spatial = window.MAP_FEATURES.filter((feature) => {
      const matchesTheme = state.theme === "all" || feature.category === state.theme;
      const matchesFilter = state.filter === "all" || (state.filter === "open" && feature.status === "open") || (state.filter === "verified" && feature.verified);
      const matchesQuery = !query || normalize([feature.name, feature.location, feature.description, ...(feature.tags || [])].join(" ")).includes(query);
      return matchesTheme && matchesFilter && matchesQuery;
    });
    const knowledge = searchKnowledge().filter((feature) => state.theme === "all" || feature.category === state.theme);
    return [...spatial, ...knowledge];
  }

  function renderResults() {
    const results = filteredFeatures();
    const activeTheme = themeById[state.theme] || themeById.all;
    elements.resultTitle.textContent = state.query ? `“${state.query}”的结果` : activeTheme.label;
    elements.resultCount.textContent = `${results.length} 项`;
    elements.resultList.innerHTML = results.length ? results.map((feature) => `
      <button class="result-card ${state.selectedId === feature.id ? "active" : ""}" data-feature-id="${feature.id}" data-knowledge="${feature.knowledgeOnly ? "true" : "false"}">
        <span class="result-icon" style="--category-color:${categoryColor(feature.category)}">${escapeHtml(feature.icon)}</span>
        <span>
          <strong>${escapeHtml(feature.name)}</strong>
          <p>${escapeHtml(feature.location)}</p>
        </span>
        <span class="result-status ${feature.status}">${statusLabel(feature.status)}</span>
      </button>
    `).join("") : `<div class="detail-description">没有找到匹配内容。可以换一个关键词，或让校园 Agent 帮你拆解需求。</div>`;
    renderMarkers();
  }

  function renderMarkers() {
    const visibleIds = new Set(filteredFeatures().filter((item) => !item.knowledgeOnly).map((item) => item.id));
    const featureMarkers = window.MAP_FEATURES.filter((feature) => visibleIds.has(feature.id)).map((feature) => `
      <button class="map-marker ${state.selectedId === feature.id ? "active" : ""}" data-feature-id="${feature.id}" aria-label="${escapeHtml(feature.name)}" style="left:${feature.x}%;top:${feature.y}%;--category-color:${categoryColor(feature.category)}">
        <span>${escapeHtml(feature.icon)}</span>
      </button>
    `).join("");
    const annotationMarkers = state.annotations.filter((annotation) => Number.isFinite(Number(annotation.x)) && Number.isFinite(Number(annotation.y))).map((annotation) => `
      <button class="map-marker annotation-marker ${state.editingAnnotationId === annotation.id ? "active" : ""}" data-annotation-id="${escapeHtml(annotation.id)}" aria-label="编辑标注 ${escapeHtml(annotation.name)}" style="left:${Number(annotation.x)}%;top:${Number(annotation.y)}%">
        <span>标</span>
      </button>
    `).join("");
    elements.markers.innerHTML = featureMarkers + annotationMarkers;
    updateTencentMarkers(visibleIds);
  }

  function resolveFeature(id, isKnowledge) {
    if (!isKnowledge && featureById[id]) return featureById[id];
    const record = window.GUIDE_DATA?.records?.find((item) => item.id === id);
    return record ? recordAsKnowledge(record) : featureById[id];
  }

  function selectFeature(id, isKnowledge = false) {
    const feature = resolveFeature(id, isKnowledge);
    if (!feature) return;
    state.selectedId = id;
    renderResults();
    renderDetail(feature);
    if (state.tmap && !feature.knowledgeOnly) {
      const coordinate = toTencentCoordinate(feature.lat, feature.lng);
      state.tmap.easeTo({ center: new TMap.LatLng(coordinate.latitude, coordinate.longitude), zoom: 18 });
    }
  }

  function renderDetail(feature) {
    const tags = (feature.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    elements.detailContent.innerHTML = `
      <span class="detail-category" style="--category-color:${categoryColor(feature.category)}">${escapeHtml((themeById[feature.category] || themeById.all).label)}</span>
      <h2>${escapeHtml(feature.name)}</h2>
      <div class="detail-location">⌖ ${escapeHtml(feature.location)}</div>
      <p class="detail-description">${escapeHtml(feature.description)}</p>
      <div class="detail-grid"><span>开放时间</span><strong>${escapeHtml(feature.hours)}</strong></div>
      <div class="detail-grid"><span>状态</span><span>${statusLabel(feature.status)}（规则推测）</span></div>
      <div class="detail-grid"><span>相关标签</span><div class="tag-list">${tags}</div></div>
      <div class="detail-actions">
        <button class="route-button" data-detail-action="route" ${feature.knowledgeOnly ? "disabled" : ""}>到这里去</button>
        <button class="ask-button" data-detail-action="ask">继续问 Agent</button>
      </div>
      <div class="verification">⚠ Demo 推测数据 · 坐标、入口和开放状态等待人工标注</div>
    `;
    elements.detailPanel.classList.add("open");
  }

  function closeDetail() {
    state.selectedId = null;
    elements.detailPanel.classList.remove("open");
    renderResults();
  }

  function renderGuideGallery() {
    elements.guideGallery.innerHTML = window.GUIDE_PAGES.map((page) => `
      <article class="guide-card">
        <img src="./原校区指南/${encodeURIComponent(page.image)}" alt="${escapeHtml(page.title)}" loading="lazy" />
        <div>
          <span class="eyebrow">PAGE ${escapeHtml(page.page)}</span>
          <h3>${escapeHtml(page.title)}</h3>
          <p>${escapeHtml(page.summary)}</p>
          <span class="guide-component">网页形式：${escapeHtml(page.component)}</span>
        </div>
      </article>
    `).join("");
  }

  function addMessage(role, content, loading = false) {
    const item = document.createElement("div");
    item.className = `message ${role}${loading ? " loading" : ""}`;
    item.textContent = content;
    elements.chatMessages.appendChild(item);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    return item;
  }

  function openAgent(seedQuestion = "") {
    elements.agentDrawer.classList.add("open");
    if (seedQuestion) {
      elements.chatInput.value = seedQuestion;
      elements.chatInput.focus();
    }
  }

  function localAgent(question) {
    const normalized = normalize(question);
    let ids = [];
    let message = "我会优先查询当前指南数据。这个 Demo 已经建立地图联动协议，但位置和开放时间仍需要人工核验。";
    if (/打印|复印/.test(normalized)) {
      ids = ["library-print", "zhongshan"];
      message = "现有指南记录了图书馆大厅和中山院的自助打印设施。我已在地图上标出两个候选点。晚上使用前仍需核验设备是否正常，以及场所是否开放。";
    } else if (/吃|餐|午饭|晚饭|夜宵|好吃/.test(normalized)) {
      ids = ["shatang-canteen", "xiangyuan", "zhenxiang", "weixiang", "wenchang-food"];
      message = "如果在校内，可以先看沙塘园或香园食堂；想吃夜宵可关注蓁巷。当前 Demo 只按指南标签推荐，尚未加入预算、实时营业和个人偏好。";
    } else if (/自习|学习|图书馆|空教室/.test(normalized)) {
      ids = ["library", "zhongshan", "dongnan"];
      message = "图书馆适合预约座位和研讨空间；中山院、东南院可以通过数智东南查询空教室。我已高亮相关地点。";
    } else if (/医院|看病|急诊|aed|急救/.test(normalized)) {
      ids = ["campus-hospital", "aed-library"];
      message = "校医院可处理基本门诊；指南建议紧急情况优先考虑鼓楼医院。图书馆等多处设有 AED，但精确楼层仍待标注。";
    } else if (/宿舍|床|洗澡|门禁/.test(normalized)) {
      ids = ["shatang-dorm", "chengyuan-dorm", "west-dorm", "wenchang-dorm"];
      message = "四个主要宿舍区域已高亮。不同楼栋的床型、卫浴和门禁不同，请选择具体宿舍区查看。";
    } else if (/地铁|公交|南京南|南京站|机场|怎么走/.test(normalized)) {
      ids = ["fuzimiao-metro", "jimingsi-metro"];
      message = "四牌楼附近可使用浮桥站和鸡鸣寺站。指南中已有大致耗时和首末班信息，但出行前应调用腾讯路线服务获取实时方案。";
    }
    return { message, placeIds: ids };
  }

  async function askAgent(question) {
    addMessage("user", question);
    const loading = addMessage("assistant", "正在查询校园数据…", true);
    let response;
    try {
      if (window.APP_CONFIG.agentEnabled) {
        const result = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: question, context: { selectedPlaceId: state.selectedId } }),
        });
        if (!result.ok) throw new Error(`Agent request failed: ${result.status}`);
        response = await result.json();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 420));
        response = localAgent(question);
      }
    } catch (error) {
      response = localAgent(question);
      response.message += "\n\n外部模型暂时不可用，已切换至本地演示规则。";
    }
    loading.remove();
    addMessage("assistant", response.message || "暂时没有找到答案。");
    if (response.placeIds?.length) {
      state.theme = "all";
      state.filter = "all";
      state.query = "";
      elements.searchInput.value = "";
      renderAll();
      selectFeature(response.placeIds[0]);
      response.placeIds.forEach((id) => document.querySelector(`.map-marker[data-feature-id="${id}"]`)?.classList.add("active"));
    }
  }

  function updateTencentMarkers(visibleIds) {
    if (!state.tmapMarkers || !window.TMap) return;
    const geometries = window.MAP_FEATURES.filter((feature) => visibleIds.has(feature.id)).map((feature) => {
      const coordinate = toTencentCoordinate(feature.lat, feature.lng);
      return {
        id: feature.id,
        styleId: feature.category === "medical" ? "alert" : "default",
        position: new TMap.LatLng(coordinate.latitude, coordinate.longitude),
        properties: { title: feature.name },
      };
    });
    state.tmapMarkers.setGeometries(geometries);
    if (state.annotationMarkers) {
      const annotationGeometries = state.annotations
        .filter((annotation) => Number.isFinite(Number(annotation.lat)) && Number.isFinite(Number(annotation.lng)))
        .map((annotation) => ({
          id: annotation.id,
          styleId: "annotation",
          position: new TMap.LatLng(Number(annotation.lat), Number(annotation.lng)),
          properties: { title: annotation.name },
        }));
      state.annotationMarkers.setGeometries(annotationGeometries);
    }
  }

  function extractTencentLatLng(event) {
    const candidate = event?.latLng || event?.lngLat || event?.coordinate || event?.location;
    if (!candidate) return null;
    const read = (value, methodName, keys) => {
      if (typeof value?.[methodName] === "function") return Number(value[methodName]());
      for (const key of keys) {
        if (value?.[key] !== undefined) return Number(value[key]);
      }
      return NaN;
    };
    const lat = read(candidate, "getLat", ["lat", "latitude"]);
    const lng = read(candidate, "getLng", ["lng", "longitude"]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, coordinateSystem: "GCJ-02" } : null;
  }

  function initializeTencentMap() {
    if (!window.TMap || !window.APP_CONFIG.tencentMapKey) return;
    elements.fallbackMap.hidden = true;
    elements.tencentMap.hidden = false;
    state.mapMode = "tencent";
    const campusCenter = toTencentCoordinate(32.0577, 118.7868);
    state.tmap = new TMap.Map(elements.tencentMap, {
      center: new TMap.LatLng(campusCenter.latitude, campusCenter.longitude),
      zoom: 17,
      pitch: 0,
      rotation: 0,
    });
    const markerSvg = (color) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46"><path fill="${color}" stroke="white" stroke-width="3" d="M18 1.5c-9 0-16.5 7.2-16.5 16.2C1.5 30 18 44.5 18 44.5S34.5 30 34.5 17.7C34.5 8.7 27 1.5 18 1.5Z"/><circle cx="18" cy="17.5" r="6" fill="white"/></svg>`)}`;
    state.tmapMarkers = new TMap.MultiMarker({
      map: state.tmap,
      styles: {
        default: new TMap.MarkerStyle({ width: 36, height: 46, anchor: { x: 18, y: 46 }, src: markerSvg("#245342") }),
        alert: new TMap.MarkerStyle({ width: 36, height: 46, anchor: { x: 18, y: 46 }, src: markerSvg("#a6423c") }),
      },
      geometries: [],
    });
    state.annotationMarkers = new TMap.MultiMarker({
      map: state.tmap,
      styles: {
        annotation: new TMap.MarkerStyle({ width: 38, height: 48, anchor: { x: 19, y: 48 }, src: markerSvg("#c2652e") }),
      },
      geometries: [],
    });
    state.tmapMarkers.on("click", (event) => {
      const id = event?.geometry?.id;
      if (id) selectFeature(id);
    });
    state.annotationMarkers.on("click", (event) => {
      const id = event?.geometry?.id;
      if (id) openAnnotationEditor(annotationCoordinate(state.annotations.find((annotation) => annotation.id === id)), id);
    });
    state.tmap.on("click", (event) => {
      if (!state.annotationMode) return;
      const coordinate = extractTencentLatLng(event);
      if (coordinate) openAnnotationEditor(coordinate);
      else setAnnotationNotice("没有读取到腾讯地图坐标，请稍后再试。", true);
    });
    elements.dataStatus.textContent = "腾讯底图 · 数据待核准";
    elements.dataStatus.classList.remove("warning");
    elements.dataStatus.classList.add("success");
    renderMarkers();
  }

  function loadTencentMap() {
    const key = window.APP_CONFIG.tencentMapKey;
    if (!key) return;
    window.__initCampusTMap = initializeTencentMap;
    const script = document.createElement("script");
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}&callback=__initCampusTMap`;
    script.async = true;
    script.onerror = () => console.warn("腾讯地图加载失败，继续使用示意地图。");
    document.head.appendChild(script);
  }

  function renderAll() {
    renderThemes();
    renderLayerBar();
    renderAnnotationPanel();
    renderResults();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const annotationEditButton = event.target.closest("[data-annotation-edit]");
      if (annotationEditButton) {
        event.stopPropagation();
        openAnnotationEditor(annotationCoordinate(state.annotations.find((annotation) => annotation.id === annotationEditButton.dataset.annotationEdit)), annotationEditButton.dataset.annotationEdit);
        return;
      }
      const annotationDeleteButton = event.target.closest("[data-annotation-delete]");
      if (annotationDeleteButton) {
        event.stopPropagation();
        deleteAnnotation(annotationDeleteButton.dataset.annotationDelete);
        return;
      }
      const annotationMarker = event.target.closest("[data-annotation-id]");
      if (annotationMarker) {
        event.stopPropagation();
        openAnnotationEditor(annotationCoordinate(state.annotations.find((annotation) => annotation.id === annotationMarker.dataset.annotationId)), annotationMarker.dataset.annotationId);
        return;
      }
      const themeButton = event.target.closest("[data-theme]");
      if (themeButton) {
        state.theme = themeButton.dataset.theme;
        state.query = "";
        elements.searchInput.value = "";
        renderAll();
      }
      const featureButton = event.target.closest("[data-feature-id]");
      if (featureButton) selectFeature(featureButton.dataset.featureId, featureButton.dataset.knowledge === "true");
      const promptButton = event.target.closest("[data-prompt]");
      if (promptButton) { openAgent(); askAgent(promptButton.dataset.prompt); }
    });

    elements.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value.trim();
      renderResults();
    });
    elements.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && elements.resultList.querySelector("[data-feature-id]")) elements.resultList.querySelector("[data-feature-id]").click();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && document.activeElement !== elements.searchInput) { event.preventDefault(); elements.searchInput.focus(); }
      if (event.key === "Escape") { closeDetail(); closeAnnotationEditor(); elements.agentDrawer.classList.remove("open"); elements.guideModal.classList.remove("open"); }
    });
    document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      renderResults();
    }));
    document.querySelector("#detailClose").addEventListener("click", closeDetail);
    document.querySelector("#agentButton").addEventListener("click", () => openAgent());
    document.querySelector("#agentClose").addEventListener("click", () => elements.agentDrawer.classList.remove("open"));
    document.querySelector("#guideButton").addEventListener("click", () => elements.guideModal.classList.add("open"));
    document.querySelector("#guideClose").addEventListener("click", () => elements.guideModal.classList.remove("open"));
    elements.annotationButton.addEventListener("click", toggleAnnotationMode);
    elements.annotationForm.addEventListener("submit", saveAnnotation);
    elements.annotationCancel.addEventListener("click", closeAnnotationEditor);
    elements.annotationFormCancel.addEventListener("click", closeAnnotationEditor);
    elements.annotationExport.addEventListener("click", downloadAnnotations);
    elements.annotationCopy.addEventListener("click", copyAnnotations);
    elements.annotationClear.addEventListener("click", () => {
      if (!state.annotations.length) {
        setAnnotationNotice("当前没有可清空的标注。", true);
        return;
      }
      if (!window.confirm(`确定清空 ${state.annotations.length} 个标注吗？`)) return;
      state.annotations = [];
      persistAnnotations();
      closeAnnotationEditor();
      renderAnnotationPanel();
      renderMarkers();
      setAnnotationNotice("标注已清空。", false);
      updateAnnotationStatus();
    });
    elements.guideModal.addEventListener("click", (event) => { if (event.target === elements.guideModal) elements.guideModal.classList.remove("open"); });
    document.querySelector("#mobileCollapse").addEventListener("click", () => elements.sidebar.classList.toggle("collapsed"));
    elements.detailPanel.addEventListener("click", (event) => {
      const action = event.target.closest("[data-detail-action]")?.dataset.detailAction;
      if (action === "ask") openAgent(`请介绍一下${resolveFeature(state.selectedId, !featureById[state.selectedId])?.name || "这个地点"}`);
      if (action === "route") openAgent(`从我当前位置怎么去${featureById[state.selectedId]?.name || "这里"}？`);
    });
    elements.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const question = elements.chatInput.value.trim();
      if (!question) return;
      elements.chatInput.value = "";
      askAgent(question);
    });
    document.querySelector("#zoomInButton").addEventListener("click", () => {
      if (state.tmap) state.tmap.zoomTo(state.tmap.getZoom() + 1);
      else { state.fallbackZoom = Math.min(1.35, state.fallbackZoom + .08); elements.fallbackMap.style.transform = `scale(${state.fallbackZoom})`; }
    });
    document.querySelector("#zoomOutButton").addEventListener("click", () => {
      if (state.tmap) state.tmap.zoomTo(state.tmap.getZoom() - 1);
      else { state.fallbackZoom = Math.max(.9, state.fallbackZoom - .08); elements.fallbackMap.style.transform = `scale(${state.fallbackZoom})`; }
    });
    document.querySelector("#locateButton").addEventListener("click", () => {
      if (!navigator.geolocation) return openAgent("如何根据我的当前位置找附近服务？");
      navigator.geolocation.getCurrentPosition((position) => {
        const coordinate = toTencentCoordinate(position.coords.latitude, position.coords.longitude);
        if (state.tmap) state.tmap.easeTo({ center: new TMap.LatLng(coordinate.latitude, coordinate.longitude), zoom: 18 });
        else openAgent("已获得我的当前位置，请推荐附近的校园服务");
      }, () => openAgent("定位权限未开启，如何从南门开始校园导览？"));
    });
    elements.fallbackMap.addEventListener("click", (event) => {
      if (!state.annotationMode || event.target.closest(".map-marker")) return;
      const rect = elements.fallbackMap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      openAnnotationEditor({
        x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
        coordinateSystem: "fallback-percent",
      });
    });
  }

  function initialize() {
    loadAnnotations();
    renderGuideGallery();
    renderAll();
    bindEvents();
    elements.agentMode.textContent = window.APP_CONFIG.agentEnabled ? "DeepSeek V4 Flash" : "本地演示模式";
    elements.promptSuggestions.innerHTML = ["晚上哪里能打印？", "中午吃什么？", "哪里可以自习？", "校医院怎么走？"].map((prompt) => `<button class="prompt-suggestion" data-prompt="${prompt}">${prompt}</button>`).join("");
    addMessage("assistant", "你好，我是四牌楼校园 Agent。当前是第一版 Demo，可以帮你查找学习、餐饮、宿舍、办事和交通信息。");
    loadTencentMap();
  }

  initialize();
})();
