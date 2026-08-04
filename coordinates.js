(function (global) {
  "use strict";

  const PI = Math.PI;
  const SEMI_MAJOR_AXIS = 6378245.0;
  const ECCENTRICITY_SQUARED = 0.006693421622965943;

  function outsideMainlandChina(latitude, longitude) {
    return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
  }

  function latitudeOffset(x, y) {
    let result = -100 + (2 * x) + (3 * y) + (0.2 * y * y) + (0.1 * x * y) + (0.2 * Math.sqrt(Math.abs(x)));
    result += ((20 * Math.sin(6 * x * PI)) + (20 * Math.sin(2 * x * PI))) * 2 / 3;
    result += ((20 * Math.sin(y * PI)) + (40 * Math.sin(y / 3 * PI))) * 2 / 3;
    result += ((160 * Math.sin(y / 12 * PI)) + (320 * Math.sin(y * PI / 30))) * 2 / 3;
    return result;
  }

  function longitudeOffset(x, y) {
    let result = 300 + x + (2 * y) + (0.1 * x * x) + (0.1 * x * y) + (0.1 * Math.sqrt(Math.abs(x)));
    result += ((20 * Math.sin(6 * x * PI)) + (20 * Math.sin(2 * x * PI))) * 2 / 3;
    result += ((20 * Math.sin(x * PI)) + (40 * Math.sin(x / 3 * PI))) * 2 / 3;
    result += ((150 * Math.sin(x / 12 * PI)) + (300 * Math.sin(x / 30 * PI))) * 2 / 3;
    return result;
  }

  // Tencent Maps uses GCJ-02 in mainland China. Browser geolocation and the
  // project's source coordinates use WGS-84, so convert only at the map edge.
  function wgs84ToGcj02(latitude, longitude) {
    if (outsideMainlandChina(latitude, longitude)) return { latitude, longitude };

    let deltaLatitude = latitudeOffset(longitude - 105, latitude - 35);
    let deltaLongitude = longitudeOffset(longitude - 105, latitude - 35);
    const latitudeRadians = latitude / 180 * PI;
    let magic = Math.sin(latitudeRadians);
    magic = 1 - (ECCENTRICITY_SQUARED * magic * magic);
    const sqrtMagic = Math.sqrt(magic);
    deltaLatitude = (deltaLatitude * 180) / ((SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED) / (magic * sqrtMagic)) * PI);
    deltaLongitude = (deltaLongitude * 180) / ((SEMI_MAJOR_AXIS / sqrtMagic * Math.cos(latitudeRadians)) * PI);

    return {
      latitude: latitude + deltaLatitude,
      longitude: longitude + deltaLongitude,
    };
  }

  global.CampusCoordinates = Object.freeze({ wgs84ToGcj02 });
})(window);
