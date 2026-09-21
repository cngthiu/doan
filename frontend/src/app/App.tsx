import { Navigate, Route, Routes } from 'react-router-dom'

import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { CandidatesPage } from '../features/candidates/CandidatesPage'
import { MonitoringPage } from '../features/monitoring/MonitoringPage'
import { RoomsPage } from '../features/rooms/RoomsPage'
import { SessionDetailPage } from '../features/sessions/SessionDetailPage'
import { SessionsPage } from '../features/sessions/SessionsPage'
import { AppShell } from '../shared/layout/AppShell'
import { EmptyFeaturePage } from '../shared/pages/PlaceholderPages'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<MonitoringPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/candidates" element={<CandidatesPage />} />
          <Route path="/events" element={<EmptyFeaturePage title="Sự kiện" />} />
          <Route path="/reports" element={<EmptyFeaturePage title="Báo cáo" />} />
          <Route path="/settings/rooms" element={<RoomsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
