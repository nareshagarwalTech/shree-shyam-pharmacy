import { ManagerAuthProvider } from '@/components/ManagerAuthProvider';
import ManagerProtectedRoute from '@/components/ManagerProtectedRoute';

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ManagerAuthProvider>
      <ManagerProtectedRoute>
        {children}
      </ManagerProtectedRoute>
    </ManagerAuthProvider>
  );
}
