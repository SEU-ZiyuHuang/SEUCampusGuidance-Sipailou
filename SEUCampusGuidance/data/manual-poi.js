// 一期人工标注任务表中已填写 GCJ-02 坐标的记录。
// 这些点位单独维护，便于后续继续补充或回溯来源；app.js 会将 replacesId
// 指向的旧点位更新为人工标注坐标，其余记录作为新的地图点位加入。
window.MANUAL_POI = (() => {
  const fallbackBounds = {
    minLng: 118.7805,
    maxLng: 118.8015,
    minLat: 32.0515,
    maxLat: 32.0605,
  };

  const fallbackPoint = (lat, lng) => ({
    x: Math.max(2, Math.min(98, ((lng - fallbackBounds.minLng) / (fallbackBounds.maxLng - fallbackBounds.minLng)) * 100)),
    y: Math.max(2, Math.min(98, ((fallbackBounds.maxLat - lat) / (fallbackBounds.maxLat - fallbackBounds.minLat)) * 100)),
  });

  const common = {
    source: "一期人工标注任务表.xlsx · POI与设施标注",
    coordinateSystem: "GCJ-02",
    verified: false,
    status: "unknown",
  };

  const records = [
    { id: "manual-poi-01-001", taskId: "POI-01-001", name: "沙塘园 · 1舍", category: "dorm", icon: "宿", lat: 32.052263, lng: 118.794781, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-002", taskId: "POI-01-002", name: "沙塘园 · 2舍", category: "dorm", icon: "宿", lat: 32.051959, lng: 118.794742, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-003", taskId: "POI-01-003", name: "沙塘园 · 3舍", category: "dorm", icon: "宿", lat: 32.05245, lng: 118.793812, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-004", taskId: "POI-01-004", name: "成园 · 1舍", category: "dorm", icon: "宿", lat: 32.052259, lng: 118.796063, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-005", taskId: "POI-01-005", name: "成园 · 2舍", category: "dorm", icon: "宿", lat: 32.05264, lng: 118.796223, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-006", taskId: "POI-01-006", name: "校西 · 群英楼", category: "dorm", icon: "宿", lat: 32.055264, lng: 118.788171, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-007", taskId: "POI-01-007", name: "校西 · 荟萃楼", category: "dorm", icon: "宿", lat: 32.055013, lng: 118.788477, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-008", taskId: "POI-01-008", name: "校西 · 学府二舍", category: "dorm", icon: "宿", lat: 32.055166, lng: 118.789036, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-010", taskId: "POI-01-010", name: "文昌桥 · 7舍", category: "dorm", icon: "宿", lat: 32.054365, lng: 118.798254, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-011", taskId: "POI-01-011", name: "文昌桥 · 8舍", category: "dorm", icon: "宿", lat: 32.053086, lng: 118.798613, location: "过门卫后直行，位于路的左侧", hours: "门禁时间：围合门禁", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-013", taskId: "POI-01-013", name: "文昌桥 · 10舍", category: "dorm", icon: "宿", lat: 32.05252, lng: 118.799422, location: "人工标注坐标 · 建筑/宿舍", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-014", taskId: "POI-01-014", name: "文昌桥 · 11舍", category: "dorm", icon: "宿", lat: 32.053086, lng: 118.798613, location: "过门卫后直行，位于路的左侧", hours: "门禁时间：围合门禁", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-015", taskId: "POI-01-015", name: "文昌桥 · 12舍", category: "dorm", icon: "宿", lat: 32.053413, lng: 118.798604, location: "穿过文8文11闸机后继续向前", hours: "门禁时间：围合门禁", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-016", taskId: "POI-01-016", name: "文昌桥 · 13舍", category: "dorm", icon: "宿", lat: 32.055033, lng: 118.798182, location: "过门卫后左转，经过莘园后，看到一排电动车或自行车停放处即为入口", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-017", taskId: "POI-01-017", name: "文昌桥 · 14舍", category: "dorm", icon: "宿", lat: 32.053762, lng: 118.79866, location: "过门卫后左转，入口在道路左侧", hours: "门禁时间：围合门禁", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-018", taskId: "POI-01-018", name: "文昌桥 · 15舍", category: "dorm", icon: "宿", lat: 32.05536, lng: 118.798177, location: "过门卫后左转，经过莘园后向前一小段距离，位于道路左侧", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-01-019", taskId: "POI-01-019", name: "文昌桥 · 16舍", category: "dorm", icon: "宿", lat: 32.05478, lng: 118.79917, location: "过门卫后左转，经过莘园后右转，位于道路右侧", tags: ["人工标注", "宿舍"] },
    { id: "manual-poi-02-001", taskId: "POI-02-001", replacesId: "shatang-canteen", name: "沙塘园食堂", category: "dining", icon: "食", lat: 32.052989, lng: 118.794333, location: "人工标注坐标 · 沙塘园", floor: "两层", hours: "早餐06:30-09:30 / 午餐11:00-13:00 / 晚餐17:00-19:00", tags: ["人工标注", "食堂"] },
    { id: "manual-poi-02-002", taskId: "POI-02-002", replacesId: "xiangyuan", name: "香园食堂", category: "dining", icon: "食", lat: 32.055399, lng: 118.78887, location: "通过学校西区闸机后直行，位于道路左侧", floor: "-", hours: "早餐06:30-09:30 / 午餐11:00-13:00 / 晚餐16:30-19:00", tags: ["人工标注", "食堂"] },
    { id: "manual-poi-02-003", taskId: "POI-02-003", replacesId: "xinyuan", name: "莘园食堂", category: "dining", icon: "食", lat: 32.054593, lng: 118.798466, location: "过门卫后左转，一直直行，位于道路右侧", floor: "-", hours: "早餐06:40-09:00 / 午餐11:00-13:00 / 晚餐17:00-19:00", tags: ["人工标注", "食堂"] },
    { id: "manual-poi-03-001", taskId: "POI-03-001", name: "图书馆 · 自习区", category: "study", icon: "学", lat: 32.054347, lng: 118.79369, location: "人工标注坐标 · 图书馆", floor: "1F-3F", hours: "工作日08:00-22:00；考试周至23:00", tags: ["人工标注", "自习", "图书馆"] },
    { id: "manual-poi-03-002", taskId: "POI-03-002", name: "图书馆 · 借还书", category: "study", icon: "学", lat: 32.054347, lng: 118.79369, location: "自助还书机位于进入图书馆大门左侧", floor: "1F", tags: ["人工标注", "借还书", "图书馆"] },
    { id: "manual-poi-03-003", taskId: "POI-03-003", name: "图书馆 · 研讨空间", category: "study", icon: "学", lat: 32.054347, lng: 118.79369, location: "人工标注坐标 · 图书馆", floor: "1F", tags: ["人工标注", "研讨", "图书馆"] },
    { id: "manual-poi-03-004", taskId: "POI-03-004", name: "图书馆 · 书库", category: "study", icon: "学", lat: 32.054347, lng: 118.79369, location: "人工标注坐标 · 图书馆", floor: "4F-7F", tags: ["人工标注", "书库", "图书馆"] },
    { id: "manual-poi-03-005", taskId: "POI-03-005", name: "图书馆 · 2F学习中心", category: "study", icon: "学", lat: 32.054347, lng: 118.79369, location: "人工标注坐标 · 图书馆", floor: "2F", tags: ["人工标注", "学习中心", "图书馆"] },
    { id: "manual-poi-03-006", taskId: "POI-03-006", name: "图书馆 · 2F中文阅览室", category: "study", icon: "学", lat: 32.054347, lng: 118.79369, location: "人工标注坐标 · 图书馆", floor: "2F", tags: ["人工标注", "中文阅览", "图书馆"] },
    { id: "manual-poi-03-007", taskId: "POI-03-007", name: "图书馆 · 3F外文阅览室", category: "study", icon: "学", lat: 32.054347, lng: 118.79369, location: "人工标注坐标 · 图书馆", floor: "3F", tags: ["人工标注", "外文阅览", "图书馆"] },
    { id: "manual-poi-03-008", taskId: "POI-03-008", name: "图书馆 · 3F报刊阅览室", category: "study", icon: "学", lat: 32.054347, lng: 118.79369, location: "人工标注坐标 · 图书馆", floor: "3F", tags: ["人工标注", "报刊阅览", "图书馆"] },
    { id: "manual-poi-04-001", taskId: "POI-04-001", name: "教务处", category: "office", icon: "办", lat: 32.05538, lng: 118.795829, location: "人工标注坐标 · 服务/办公室", tags: ["人工标注", "教务"] },
    { id: "manual-poi-04-002", taskId: "POI-04-002", replacesId: "finance", name: "财务处", category: "office", icon: "办", lat: 32.05538, lng: 118.795829, location: "人工标注坐标 · 服务/办公室", tags: ["人工标注", "财务"] },
  ];

  return records.map((record) => ({
    ...common,
    ...record,
    ...fallbackPoint(record.lat, record.lng),
    description: record.description || `来自一期人工标注任务 ${record.taskId}；坐标系为 GCJ-02。`,
  }));
})();
