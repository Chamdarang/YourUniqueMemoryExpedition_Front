import type { LoginRequest, LoginResponse } from "../types/auth";
import type { ApiResponse } from "../types/common";

export const loginApi = async (data: LoginRequest): Promise<LoginResponse> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const json: ApiResponse<LoginResponse> = await res.json();

  if (!res.ok || !json.success){
    throw new Error(json.message)
  }
  return json.data;
};