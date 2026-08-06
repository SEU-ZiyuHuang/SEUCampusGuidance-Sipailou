// 用户于 2026-08-06 从腾讯地图导出的现场人工标注。
// 坐标已经是 GCJ-02；replacesId 用于更新地图中同名的基础点位，避免重复大头针。
window.IMPORTED_ANNOTATIONS = (() => {
  const fallbackBounds = {
    minLng: 118.7805,
    maxLng: 118.8015,
    minLat: 32.048,
    maxLat: 32.0605,
  };

  const fallbackPoint = (lat, lng) => ({
    x: Math.max(2, Math.min(98, ((lng - fallbackBounds.minLng) / (fallbackBounds.maxLng - fallbackBounds.minLng)) * 100)),
    y: Math.max(2, Math.min(98, ((fallbackBounds.maxLat - lat) / (fallbackBounds.maxLat - fallbackBounds.minLat)) * 100)),
  });

  const records = [
    { annotationId: "annotation-1786035659690-cf8cp", replacesId: "zhongshan", name: "中山院", category: "study", icon: "学", lat: 32.05361453912667, lng: 118.79471977315347 },
    { annotationId: "annotation-1786035690323-jnrsn", replacesId: "stadium", name: "四牌楼校区体育场", category: "sports", icon: "体", lat: 32.05640312734803, lng: 118.79257621211548 },
    { annotationId: "annotation-1786035732045-v3xaa", replacesId: "gym", name: "体育馆", category: "sports", icon: "体", lat: 32.0567432268788, lng: 118.79187176522055 },
    { annotationId: "annotation-1786035751014-wc8au", replacesId: "shatang-dorm", name: "沙塘园宿舍区", category: "dorm", icon: "宿", lat: 32.05270746570639, lng: 118.7941508885599 },
    { annotationId: "annotation-1786035771855-0hy6e", replacesId: "chengyuan-dorm", name: "成园宿舍区", category: "dorm", icon: "宿", lat: 32.05243815224797, lng: 118.7961030234037 },
    { annotationId: "annotation-1786035802847-owf0g", replacesId: "west-dorm", name: "校西宿舍区", category: "dorm", icon: "宿", lat: 32.055197196977126, lng: 118.78877490763978 },
    { annotationId: "annotation-1786035833197-23u1r", replacesId: "wenchang-dorm", name: "文昌桥宿舍区", category: "dorm", icon: "宿", lat: 32.054473011697155, lng: 118.79870886125991 },
    { annotationId: "annotation-1786035872933-sayg1", replacesId: "security", name: "保卫处", category: "office", icon: "办", lat: 32.053166977150354, lng: 118.79418532111913 },
    { annotationId: "annotation-1786035895291-lj167", replacesId: "campus-hospital", name: "东南大学校医院", category: "medical", icon: "医", lat: 32.05191706621575, lng: 118.7959960894757 },
    { annotationId: "annotation-1786035908340-j3sv6", replacesId: "fuzimiao-metro", name: "浮桥地铁站", category: "transport", icon: "地", lat: 32.04882497442549, lng: 118.7962341250302 },
    { annotationId: "annotation-1786035919244-74f74", replacesId: "jimingsi-metro", name: "鸡鸣寺地铁站", category: "transport", icon: "地", lat: 32.05746345034269, lng: 118.79754196418253 },
    { annotationId: "annotation-1786035952357-rawqj", replacesId: "zhenxiang", name: "蓁巷餐饮街区", category: "dining", icon: "食", lat: 32.05304527971596, lng: 118.79354593362063 },
    { annotationId: "annotation-1786035981825-pdr3c", replacesId: "library-print", name: "图书馆大厅自助打印", category: "service", icon: "印", lat: 32.05501883630356, lng: 118.79357968906129 },
    { annotationId: "annotation-1786036012380-t4jzp", replacesId: "shatang-express", name: "沙塘园近邻宝", category: "service", icon: "递", lat: 32.05310626199611, lng: 118.79465613107891 },
    { annotationId: "annotation-1786036025566-c7trv", replacesId: "aed-library", name: "图书馆 AED", category: "medical", icon: "医", lat: 32.05500832958556, lng: 118.79359287255784 },
  ];

  return records.map((record) => ({
    ...record,
    source: "sipailou-map-annotations-20260806.json · 用户现场标注",
    description: "用户现场标注，详情待补充。",
    location: "腾讯地图人工标注坐标",
    coordinateSystem: "GCJ-02",
    verified: false,
    tags: ["人工标注"],
    ...fallbackPoint(record.lat, record.lng),
  }));
})();
