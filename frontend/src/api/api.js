import axios from "axios";

<<<<<<< HEAD
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
=======
const API_BASE_URL = "https://medipill-backend.onrender.com";
>>>>>>> ed0d7fae911a9dfcb124b6c6bd6fa3504b8e55e6

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});