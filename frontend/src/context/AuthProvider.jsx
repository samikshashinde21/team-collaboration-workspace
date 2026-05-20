import { useCallback, useMemo, useState } from "react";
import api from "../api/api";
import AuthContext from "./AuthContext";

const getSavedUser = () => {
  const savedUser = localStorage.getItem("user");

  return savedUser ? JSON.parse(savedUser) : null;
};

const getSavedToken = () => {
  return localStorage.getItem("token");
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getSavedUser);
  const [token, setToken] = useState(getSavedToken);

  const saveAuth = useCallback((authData) => {
    localStorage.setItem("token", authData.token);
    localStorage.setItem("user", JSON.stringify(authData.user));
    setToken(authData.token);
    setUser(authData.user);
  }, []);

  const login = useCallback(
    async (formData) => {
      const { data } = await api.post("/auth/login", formData);
      saveAuth(data);
      return data.user;
    },
    [saveAuth]
  );

  const register = useCallback(
    async (formData) => {
      const { data } = await api.post("/auth/register", formData);
      saveAuth(data);
      return data.user;
    },
    [saveAuth]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((nextUser) => {
    localStorage.setItem("user", JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      updateUser,
    }),
    [user, token, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
