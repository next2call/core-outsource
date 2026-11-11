// api.js
import axios from "axios";

const api = axios.create({
  baseURL: `https://${window.location.hostname}:4000`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let isLoggingOut = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      // error.response?.status === 403 &&
      error.response?.data === "Invalid token."
    ) {
      if (!isLoggingOut) {
        isLoggingOut = true;

        localStorage.removeItem("token");
        window.location.replace("/login");
      }
    }

    return Promise.reject(error);
  }
);

export default api;