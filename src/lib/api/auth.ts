import { apiFetch } from "@/lib/api/client";
import type { LoginRequest, RegisterRequest, TokenResponse, User } from "@/lib/types";

// Registration does not log in (the API answers with the user, not a token): the caller logs in next.
export const register = (request: RegisterRequest) =>
  apiFetch<User>("/auth/register", { method: "POST", body: request });

export const login = (request: LoginRequest) =>
  apiFetch<TokenResponse>("/auth/login", { method: "POST", body: request });

export const getCurrentUser = () => apiFetch<User>("/users/me");
