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
  const sheetCategory = {
    "宿舍信息": "dorm", "食堂信息": "dining", "图书馆与学习设施": "study",
    "行政窗口": "office", "交通信息": "transport", "周边餐饮": "nearby",
    "周边商业服务": "service", "运动设施": "sports", "一卡通与生活服务": "service",
  };

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
    elements.markers.innerHTML = window.MAP_FEATURES.filter((feature) => visibleIds.has(feature.id)).map((feature) => `
      <button class="map-marker ${state.selectedId === feature.id ? "active" : ""}" data-feature-id="${feature.id}" aria-label="${escapeHtml(feature.name)}" style="left:${feature.x}%;top:${feature.y}%;--category-color:${categoryColor(feature.category)}">
        <span>${escapeHtml(feature.icon)}</span>
      </button>
    `).join("");
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
      state.tmap.easeTo({ center: new TMap.LatLng(feature.lat, feature.lng), zoom: 18 });
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
    const geometries = window.MAP_FEATURES.filter((feature) => visibleIds.has(feature.id)).map((feature) => ({
      id: feature.id,
      styleId: feature.category === "medical" ? "alert" : "default",
      position: new TMap.LatLng(feature.lat, feature.lng),
      properties: { title: feature.name },
    }));
    state.tmapMarkers.setGeometries(geometries);
  }

  function initializeTencentMap() {
    if (!window.TMap || !window.APP_CONFIG.tencentMapKey) return;
    elements.fallbackMap.hidden = true;
    elements.tencentMap.hidden = false;
    state.mapMode = "tencent";
    state.tmap = new TMap.Map(elements.tencentMap, {
      center: new TMap.LatLng(32.0577, 118.7868),
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
    state.tmapMarkers.on("click", (event) => selectFeature(event.geometry.id));
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
    renderResults();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
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
      if (event.key === "Escape") { closeDetail(); elements.agentDrawer.classList.remove("open"); elements.guideModal.classList.remove("open"); }
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
        if (state.tmap) state.tmap.easeTo({ center: new TMap.LatLng(position.coords.latitude, position.coords.longitude), zoom: 18 });
        else openAgent("已获得我的当前位置，请推荐附近的校园服务");
      }, () => openAgent("定位权限未开启，如何从南门开始校园导览？"));
    });
  }

  function initialize() {
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
