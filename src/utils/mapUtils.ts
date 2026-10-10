import type { SpotType } from "../types/enums";

type ClassifiedType = { spotType: SpotType; confidence: number };

const TYPE_CATEGORY: Record<string, ClassifiedType> = {
    // 숙소와 교통
    lodging: { spotType: "ACCOMMODATION", confidence: 3 },
    hotel: { spotType: "ACCOMMODATION", confidence: 3 },
    hostel: { spotType: "ACCOMMODATION", confidence: 3 },
    guest_house: { spotType: "ACCOMMODATION", confidence: 3 },
    bed_and_breakfast: { spotType: "ACCOMMODATION", confidence: 3 },
    campground: { spotType: "PARK", confidence: 3 },
    train_station: { spotType: "STATION", confidence: 3 },
    subway_station: { spotType: "STATION", confidence: 3 },
    light_rail_station: { spotType: "STATION", confidence: 3 },
    transit_station: { spotType: "STATION", confidence: 3 },
    bus_station: { spotType: "STATION", confidence: 3 },
    airport: { spotType: "STATION", confidence: 3 },

    // 음식과 쇼핑
    restaurant: { spotType: "FOOD", confidence: 3 },
    food: { spotType: "FOOD", confidence: 1 },
    meal_takeaway: { spotType: "FOOD", confidence: 3 },
    meal_delivery: { spotType: "FOOD", confidence: 3 },
    bar: { spotType: "FOOD", confidence: 2 },
    cafe: { spotType: "CAFE", confidence: 3 },
    coffee_shop: { spotType: "CAFE", confidence: 3 },
    tea_house: { spotType: "CAFE", confidence: 3 },
    bakery: { spotType: "CAFE", confidence: 2 },
    ice_cream_shop: { spotType: "CAFE", confidence: 2 },
    shopping_mall: { spotType: "SHOPPING", confidence: 3 },
    department_store: { spotType: "SHOPPING", confidence: 3 },
    store: { spotType: "SHOPPING", confidence: 1 },
    supermarket: { spotType: "SHOPPING", confidence: 3 },
    convenience_store: { spotType: "SHOPPING", confidence: 3 },
    market: { spotType: "SHOPPING", confidence: 2 },

    // 관광·문화·자연
    tourist_attraction: { spotType: "LANDMARK", confidence: 2 },
    castle: { spotType: "HISTORICAL_SITE", confidence: 3 },
    archaeological_site: { spotType: "HISTORICAL_SITE", confidence: 3 },
    historical_landmark: { spotType: "HISTORICAL_SITE", confidence: 3 },
    historical_place: { spotType: "HISTORICAL_SITE", confidence: 3 },
    ruins: { spotType: "HISTORICAL_SITE", confidence: 3 },
    fortress: { spotType: "HISTORICAL_SITE", confidence: 3 },
    shrine: { spotType: "RELIGIOUS_SITE", confidence: 3 },
    temple: { spotType: "RELIGIOUS_SITE", confidence: 3 },
    church: { spotType: "RELIGIOUS_SITE", confidence: 3 },
    mosque: { spotType: "RELIGIOUS_SITE", confidence: 3 },
    synagogue: { spotType: "RELIGIOUS_SITE", confidence: 3 },
    place_of_worship: { spotType: "RELIGIOUS_SITE", confidence: 2 },
    museum: { spotType: "MUSEUM", confidence: 3 },
    art_gallery: { spotType: "MUSEUM", confidence: 3 },
    park: { spotType: "PARK", confidence: 3 },
    natural_feature: { spotType: "NATURE", confidence: 3 },
    beach: { spotType: "NATURE", confidence: 3 },
    national_park: { spotType: "NATURE", confidence: 3 },
    amusement_park: { spotType: "ACTIVITY", confidence: 3 },
    aquarium: { spotType: "ACTIVITY", confidence: 3 },
    zoo: { spotType: "ACTIVITY", confidence: 3 },
    bowling_alley: { spotType: "ACTIVITY", confidence: 3 },
    casino: { spotType: "ACTIVITY", confidence: 3 },
    stadium: { spotType: "ACTIVITY", confidence: 3 },
    movie_theater: { spotType: "ACTIVITY", confidence: 3 },
    gym: { spotType: "ACTIVITY", confidence: 3 },
};

const GENERIC_TYPES = new Set(["establishment", "point_of_interest"]);

function classifyType(type: string): ClassifiedType | undefined {
    const normalized = type.trim().toLowerCase();
    const exactMatch = TYPE_CATEGORY[normalized];
    if (exactMatch) return exactMatch;

    // Google has many cuisine-specific primary types (for example japanese_restaurant).
    if (normalized.endsWith("_restaurant")) return { spotType: "FOOD", confidence: 3 };
    if (normalized.endsWith("_store")) return { spotType: "SHOPPING", confidence: 2 };
    if (GENERIC_TYPES.has(normalized)) return undefined;
    return undefined;
}

/**
 * Prefer Google's single primary type. When it is unavailable (for example in
 * autocomplete predictions), infer only from meaningful types and return OTHER
 * when equally specific signals disagree.
 */
export const mapGoogleTypeToSpotType = (
    googleTypes: string[] | undefined,
    primaryType?: string | null,
): SpotType => {
    if (primaryType) {
        return classifyType(primaryType)?.spotType ?? "OTHER";
    }

    const candidates = (googleTypes || [])
        .map(classifyType)
        .filter((candidate): candidate is ClassifiedType => candidate !== undefined);
    if (candidates.length === 0) return "OTHER";

    const highestConfidence = Math.max(...candidates.map(candidate => candidate.confidence));
    const strongestTypes = new Set(
        candidates
            .filter(candidate => candidate.confidence === highestConfidence)
            .map(candidate => candidate.spotType),
    );
    return strongestTypes.size === 1 ? [...strongestTypes][0] : "OTHER";
};
