import type { LoginRequest, LoginResponse, SignupRequest } from "../types/auth";
import type { ApiResponse } from "../types/common";
import { getApiUrl } from "./utils";

export const loginApi = async (data: LoginRequest): Promise<LoginResponse> => {
  const res = await fetch(getApiUrl('/api/auth/login'), {
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

export const signupApi = async (data: SignupRequest): Promise<void> => {
  const res = await fetch(getApiUrl('/api/auth/signup'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const json: ApiResponse<null> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message);
  }
};
