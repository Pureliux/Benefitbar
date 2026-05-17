
import React from 'react';
import { Route, Routes, BrowserRouter as Router, Navigate } from 'react-router-dom';
import { ThemeProvider, ThemeSync } from '@/components/theme-provider.jsx';
import { AuthProvider, useAuth } from '@/contexts/AuthContext.jsx';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute.jsx';
import LoginPage from '@/pages/LoginPage.jsx';
import ActivationPage from '@/pages/ActivationPage.jsx';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from '@/pages/ResetPasswordPage.jsx';
import AccessDeniedPage from '@/pages/AccessDeniedPage.jsx';
import DashboardPage from '@/pages/DashboardPage.jsx';
import BenefitSelectionPage from '@/pages/BenefitSelectionPage.jsx';
import SubmissionPage from '@/pages/SubmissionPage.jsx';
import HelpPage from '@/pages/HelpPage.jsx';
import AdminDashboard from '@/pages/AdminDashboard.jsx';
import AdminSystemCheck from '@/pages/AdminSystemCheck.jsx';

// Note: Ensure HomePage is defined if you have it. Redirecting / to /dashboard for now as per previous structure.
function AppContent() {
  const { employee } = useAuth();
  
  return (
    <>
      <ThemeSync employee={employee} />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/activate" element={<ActivationPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/benefits"
          element={
            <ProtectedRoute>
              <BenefitSelectionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/submission"
          element={
            <ProtectedRoute>
              <SubmissionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <HelpPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/system-check"
          element={
            <ProtectedRoute adminOnly>
              <AdminSystemCheck />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
