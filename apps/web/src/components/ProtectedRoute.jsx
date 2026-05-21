
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { isAllowedLoginEmail } from '@/lib/emailAccess';

const ProtectedRoute = ({ children, adminOnly = false, hrOnly = false }) => {
  const { currentUser, employee, isAdmin, isHr, initialLoading } = useAuth();

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground text-lg">Lädt …</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!employee || employee.status !== 'active') {
    return <Navigate to="/access-denied" replace />;
  }

  if (!isAllowedLoginEmail(currentUser.email)) {
    return <Navigate to="/access-denied" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (hrOnly && !isHr) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
