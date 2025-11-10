// src/api.js
const API_BASE = process.env.REACT_APP_API_URL || ""; // Use proxy or set REACT_APP_API_URL

let token = localStorage.getItem("bbms_token") || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem("bbms_token", t);
  else localStorage.removeItem("bbms_token");
}

function authHeaders(hasJson = true) {
  const headers = {};
  if (hasJson) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = token;
  return headers;
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!res.ok) {
    const err = new Error("Request failed");
    err.status = res.status;
    err.body = payload;
    throw err;
  }
  return payload;
}

export async function register(payload) {
  return request("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function login(username, password) {
  const data = await request("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (data && data.token) {
    setToken(data.token);
  }
  return data;
}

export async function logout() {
  setToken(null);
}

export async function getMe() {
  return request("/api/me", { headers: authHeaders() });
}

export async function updateProfile(payload) {
  return request("/api/me", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function getUsers() {
  return request("/api/users", { headers: authHeaders() });
}

export async function getInventory() {
  return request("/api/inventory", { headers: authHeaders(false) });
}

export async function updateInventory(bloodType, units) {
  return request("/api/inventory", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ bloodType, units })
  });
}

export async function getRequests() {
  return request("/api/requests", { headers: authHeaders() });
}

export async function createRequest(bloodType, units) {
  return request("/api/requests", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ bloodType, units })
  });
}

export async function deleteRequest(id) {
  return request(`/api/requests/${id}`, {
    method: "DELETE",
    headers: authHeaders()
  });
}

export async function donateRequest(requestId) {
  return request("/api/donate", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ requestId })
  });
}

export async function getNotifications() {
  return request("/api/notifications", { headers: authHeaders(false) });
}

export async function createNotification(message) {
  return request("/api/notifications", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message })
  });
}

export async function getVolunteers() {
  return request("/api/volunteers", { headers: authHeaders(false) });
}

export async function getLocations() {
  return request("/api/locations", { headers: authHeaders(false) });
}

export default {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  getUsers,
  getInventory,
  updateInventory,
  getRequests,
  createRequest,
  deleteRequest,
  donateRequest,
  getNotifications,
  createNotification,
  getVolunteers,
  getLocations,
  setToken
};