import axios from "axios";

// Normalize the configured API base URL so it always ends with exactly one
// "/api" — tolerant of VITE_API_URL being set with or without the suffix or a
// trailing slash (a common deployment foot-gun).
function resolveBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

export const api = axios.create({
  baseURL: resolveBaseUrl(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
