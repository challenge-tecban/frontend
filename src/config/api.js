import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  headers: {
    "Content-Type": "application/json",
  },
});

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    localStorage.setItem("token", token);
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}

export const getAuthToken = () => {
  return api.defaults.headers.common["Authorization"];
};

export const clearAuthToken = () => {
  delete api.defaults.headers.common["Authorization"];
}

export default api;