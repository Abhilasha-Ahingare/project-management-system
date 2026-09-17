import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

const ACCESS_TOKEN_KEY = "projecthub_access_token";
let token = localStorage.getItem(ACCESS_TOKEN_KEY);
let unauthorized = () => {};
let refreshPromise;

export const setAccessToken = (value) => {
  token = value;
  if (value) localStorage.setItem(ACCESS_TOKEN_KEY, value);
  else localStorage.removeItem(ACCESS_TOKEN_KEY);
};
export const setUnauthorizedHandler = (handler) => {
  unauthorized = handler;
};
export const unwrap = (response) => response.data?.data;
export const apiMessage = (error, fallback) => {
  const response = error.response?.data;
  if (response?.errors?.length) {
    return response.errors
      .map((item) => item.message || item)
      .filter(Boolean)
      .join(", ");
  }
  return response?.message || fallback;
};

api.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    if (
      error.response?.status !== 401 ||
      request?._retry ||
      request?.url?.includes("/auth/")
    ) {
      if (error.response?.status === 401 && !request?.url?.includes("/auth/"))
        unauthorized();
      return Promise.reject(error);
    }
    request._retry = true;
    try {
      refreshPromise ||= api
        .post("/auth/refresh")
        .then((response) => {
          const nextToken = response.data?.data?.accessToken;
          setAccessToken(nextToken);
          return nextToken;
        })
        .finally(() => {
          refreshPromise = undefined;
        });
      await refreshPromise;
      return api(request);
    } catch (refreshError) {
      setAccessToken(null);
      unauthorized();
      return Promise.reject(refreshError);
    }
  },
);

export default api;
