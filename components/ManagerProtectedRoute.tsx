'use client';

import { useManagerAuth } from './ManagerAuthProvider';
import ManagerLoginScreen from './ManagerLoginScreen';

interface ManagerProtectedRouteProps {
  children: React.ReactNode;
}

export default function ManagerProtectedRoute({ children }: ManagerProtectedRouteProps) {
  const { isAuthenticated } = useManagerAuth();
  if (!isAuthenticated) return <ManagerLoginScreen />;
  return <>{children}</>;
}
