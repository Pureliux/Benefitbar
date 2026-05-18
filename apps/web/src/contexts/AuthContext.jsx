import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import pb from '@/lib/pocketbaseClient';
import apiServerClient from '@/lib/apiServerClient';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

function removeAuthTokenFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('authToken')) {
    return;
  }
  url.searchParams.delete('authToken');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const navigate = useNavigate();

  const clearSession = () => {
    localStorage.removeItem('backend_token');
    pb.authStore.clear();
    setCurrentUser(null);
    setEmployee(null);
  };

  const handleErrorResponse = async (res, fallback = 'Technischer Fehler. Bitte später erneut versuchen.') => {
    if (!res) {
      return 'Verbindung zum Server konnte nicht hergestellt werden.';
    }

    try {
      const errorData = await res.json();
      return errorData.error || errorData.message || fallback;
    } catch {
      return res.status >= 500 ? fallback : 'Aktion konnte nicht abgeschlossen werden.';
    }
  };

  const hydrateSession = async () => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('authToken');
    if (tokenFromUrl) {
      localStorage.setItem('backend_token', tokenFromUrl);
      removeAuthTokenFromUrl();
    }

    const token = localStorage.getItem('backend_token');
    if (!token) {
      clearSession();
      return false;
    }

    try {
      const res = await apiServerClient.fetch('/auth/me');
      if (!res.ok) {
        clearSession();
        return false;
      }

      const data = await res.json();
      setCurrentUser(data.user);
      setEmployee(data.employee);
      return true;
    } catch {
      clearSession();
      return false;
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      await hydrateSession();
      setInitialLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const res = await apiServerClient.fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        return { success: false, error: await handleErrorResponse(res, 'Die Anmeldung konnte technisch nicht verarbeitet werden. Bitte später erneut versuchen.') };
      }

      const data = await res.json();
      localStorage.setItem('backend_token', data.token);
      setCurrentUser(data.user);
      setEmployee(data.employee);

      try {
        await pb.collection('users').authWithPassword(email, password, { $autoCancel: false });
      } catch (pbErr) {
        console.warn('PocketBase user auth sync failed:', pbErr);
      }

      return { success: true, redirectUrl: data.redirectUrl || '/dashboard' };
    } catch {
      return { success: false, error: 'Verbindung zum Server konnte nicht hergestellt werden.' };
    }
  };

  const requestAccess = async (email) => {
    try {
      const res = await apiServerClient.fetch('/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        return { success: false, error: await handleErrorResponse(res) };
      }

      const data = await res.json();
      return { success: true, message: data.message };
    } catch {
      return { success: false, error: 'Verbindung zum Server konnte nicht hergestellt werden.' };
    }
  };

  const activateAccount = async (token, password, passwordConfirm) => {
    try {
      const res = await apiServerClient.fetch('/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, passwordConfirm }),
      });

      if (!res.ok) {
        return { success: false, error: await handleErrorResponse(res) };
      }

      const data = await res.json();
      return { success: true, message: data.message };
    } catch {
      return { success: false, error: 'Verbindung zum Server konnte nicht hergestellt werden.' };
    }
  };

  const forgotPassword = async (email) => {
    try {
      const res = await apiServerClient.fetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        return { success: false, error: await handleErrorResponse(res) };
      }

      const data = await res.json();
      return { success: true, message: data.message };
    } catch {
      return { success: false, error: 'Verbindung zum Server konnte nicht hergestellt werden.' };
    }
  };

  const resetPassword = async (token, password, passwordConfirm) => {
    try {
      const res = await apiServerClient.fetch('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, passwordConfirm }),
      });

      if (!res.ok) {
        return { success: false, error: await handleErrorResponse(res) };
      }

      const data = await res.json();
      return { success: true, message: data.message };
    } catch {
      return { success: false, error: 'Verbindung zum Server konnte nicht hergestellt werden.' };
    }
  };

  const createUser = async (userData) => {
    try {
      const res = await apiServerClient.fetch('/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      if (!res.ok) {
        return { success: false, error: await handleErrorResponse(res) };
      }

      const data = await res.json();
      return { success: true, message: data.message };
    } catch {
      return { success: false, error: 'Verbindung zum Server konnte nicht hergestellt werden.' };
    }
  };

  const validateToken = async (token) => {
    try {
      const res = await apiServerClient.fetch(`/auth/validate-token?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        return { valid: false };
      }
      return await res.json();
    } catch {
      return { valid: false };
    }
  };

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  const isAdmin = Boolean(employee?.isAdmin || currentUser?.isAdmin);
  const isEligible = employee?.eligibleFrom ? new Date() >= new Date(employee.eligibleFrom) : true;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        employee,
        isAdmin,
        isEligible,
        login,
        requestAccess,
        activateAccount,
        forgotPassword,
        resetPassword,
        createUser,
        validateToken,
        logout,
        hydrateSession,
        initialLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
