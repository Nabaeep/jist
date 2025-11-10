// src/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from "react";
import api, { setToken as apiSetToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("bbms_token") || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiSetToken(token);
  }, [token]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.getMe();
        if (mounted) setCurrentUser(me);
      } catch (err) {
        console.warn("Auth init failed:", err);
        setTokenLocal(null);
        setCurrentUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => { mounted = false; };
  }, [token]);

  function setTokenLocal(t) {
    setToken(t);
    apiSetToken(t);
    if (t) localStorage.setItem("bbms_token", t);
    else localStorage.removeItem("bbms_token");
  }

  async function login(username, password) {
    const data = await api.login(username, password);
    if (data && data.token) {
      setTokenLocal(data.token);
      setCurrentUser(data.user);
      return data.user;
    }
    throw new Error("Login failed");
  }

  async function register(payload) {
    return api.register(payload);
  }

  async function logout() {
    setTokenLocal(null);
    setCurrentUser(null);
    await api.logout?.();
  }

  async function refreshMe() {
    if (!token) return null;
    const me = await api.getMe();
    setCurrentUser(me);
    return me;
  }

  async function updateProfile(payload) {
    await api.updateProfile(payload);
    await refreshMe();
  }

  return (
    <AuthContext.Provider value={{ token, setToken: setTokenLocal, currentUser, login, register, logout, loading, refreshMe, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}