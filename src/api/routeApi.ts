import { fetchWithAuth } from "./utils";
import type { ApiResponse } from "../types/common";
import type { RouteEstimateRequest, RouteEstimateResponse } from "../types/route";

export const estimateRoute = async (
  request: RouteEstimateRequest,
): Promise<RouteEstimateResponse> => {
  const response = await fetchWithAuth("/api/routes/estimate", {
    method: "POST",
    body: JSON.stringify(request),
  });

  const json: ApiResponse<RouteEstimateResponse> = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.message || "경로를 계산하지 못했습니다.");
  }
  return json.data;
};
