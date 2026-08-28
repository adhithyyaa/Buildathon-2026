import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Gate for the dashboard. Unauthenticated visitors are sent to /login with the path they wanted, so
 * they land back there after signing in. Renders nothing until the persisted session has been read.
 */
export function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <div className="min-h-screen bg-[#f8fafc]" aria-hidden="true" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
