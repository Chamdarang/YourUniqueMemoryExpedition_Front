import type { SpotType } from "../types/enums";

export const mapGoogleTypeToSpotType = (googleTypes: string[] | undefined): SpotType => {
    if (!googleTypes || googleTypes.length === 0) return 'OTHER';

    const typeSet = new Set(googleTypes);

    // ---------------------------------------------------------
    // 1순위: 명확한 숙소, 교통 (다른 카테고리와 겹칠 확률 낮음)
    // ---------------------------------------------------------
    if (typeSet.has('lodging') || typeSet.has('hotel') || typeSet.has('hostel') || typeSet.has('guest_house')) return 'ACCOMMODATION';
    if (typeSet.has('train_station') || typeSet.has('subway_station') || typeSet.has('light_rail_station') || typeSet.has('transit_station')) return 'STATION';
    if (typeSet.has('airport')) return 'STATION';

    // ---------------------------------------------------------
    // 2순위: 랜드마크 & 관광지 (가장 우선시 되어야 함)
    // ---------------------------------------------------------
    if (typeSet.has('tourist_attraction') || typeSet.has('point_of_interest')) {

        if (typeSet.has('castle') || typeSet.has('archaeological_site') || typeSet.has('ruins') || typeSet.has('fortress')) return 'HISTORICAL_SITE';
        if (typeSet.has('place_of_worship') || typeSet.has('shrine') || typeSet.has('temple') || typeSet.has('church') || typeSet.has('mosque') || typeSet.has('synagogue')) return 'RELIGIOUS_SITE';
        if (typeSet.has('museum') || typeSet.has('art_gallery')) return 'MUSEUM';
        if (typeSet.has('amusement_park') || typeSet.has('aquarium') || typeSet.has('zoo') || typeSet.has('bowling_alley') || typeSet.has('casino')) return 'ACTIVITY';
        if (typeSet.has('park')) return 'PARK';

        return 'LANDMARK'; // 위 조건에 안 걸리는 순수 관광지 (타워, 광장 등)
    }

    // ---------------------------------------------------------
    // 3순위: 구체적인 시설 (역사, 종교, 박물관, 공원 등)
    // ---------------------------------------------------------
    // 관광지 태그가 없더라도, 구체적인 타입이 있으면 분류
    if (typeSet.has('castle') || typeSet.has('archaeological_site')) return 'HISTORICAL_SITE'; // ✅ 여기도 추가
    if (typeSet.has('place_of_worship') || typeSet.has('shrine') || typeSet.has('temple') || typeSet.has('church')) return 'RELIGIOUS_SITE';
    if (typeSet.has('museum') || typeSet.has('art_gallery')) return 'MUSEUM';
    if (typeSet.has('park') || typeSet.has('campground')) return 'PARK';
    if (typeSet.has('natural_feature')) return 'NATURE';

    // ---------------------------------------------------------
    // 4순위: 음식점 & 카페 (가장 흔한 카테고리)
    // ---------------------------------------------------------
    if (typeSet.has('cafe') || typeSet.has('bakery') || typeSet.has('coffee_shop')) return 'CAFE';
    if (typeSet.has('restaurant') || typeSet.has('food') || typeSet.has('meal_takeaway') || typeSet.has('bar')) return 'FOOD';

    // ---------------------------------------------------------
    // 5순위: 쇼핑 & 액티비티
    // ---------------------------------------------------------
    if (typeSet.has('shopping_mall') || typeSet.has('store') || typeSet.has('department_store') || typeSet.has('clothing_store') || typeSet.has('convenience_store') || typeSet.has('supermarket')) return 'SHOPPING';
    if (typeSet.has('amusement_park') || typeSet.has('aquarium') || typeSet.has('zoo') || typeSet.has('stadium') || typeSet.has('movie_theater') || typeSet.has('gym')) return 'ACTIVITY';

    return 'OTHER';
};