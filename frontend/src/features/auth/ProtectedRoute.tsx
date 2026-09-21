import { Navigate, Outlet } from 'react-router-dom'

import { LoadingState } from '../../shared/components/LoadingState'
import { useAuth } from './AuthProvider'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingState message="Đang xác thực phiên đăng nhập…" />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
