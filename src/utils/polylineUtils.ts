export interface RoutePoint {
  lat: number;
  lng: number;
}

export const decodeGooglePolyline = (encoded: string): RoutePoint[] => {
  const points: RoutePoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const decodeValue = () => {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      if (index >= encoded.length) {
        throw new Error("잘못된 Google 경로 데이터입니다.");
      }
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    latitude += decodeValue();
    longitude += decodeValue();
    points.push({ lat: latitude / 1e5, lng: longitude / 1e5 });
  }

  return points;
};
