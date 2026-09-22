import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../../features/auth/AuthProvider'
import type { UserRole } from '../../features/auth/types'
import { roleLabels } from '../i18n/vi'

const navigation = [
  { label: 'Giám sát', to: '/', end: true, roles: ['SUPERVISOR', 'ADMIN'] as UserRole[] },
  { label: 'Phiên thi', to: '/sessions', roles: ['SUPERVISOR', 'REVIEWER', 'ADMIN'] as UserRole[] },
  { label: 'Thí sinh', to: '/candidates', roles: ['SUPERVISOR', 'REVIEWER', 'ADMIN'] as UserRole[] },
  { label: 'Sự kiện', to: '/events', disabled: true, roles: ['REVIEWER', 'ADMIN'] as UserRole[] },
  { label: 'Báo cáo', to: '/reports', disabled: true, roles: ['ADMIN'] as UserRole[] },
]

export function AppShell() {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <span className="brand-badge small">E</span>
          <div>
            <strong>ExamGuard</strong>
            <small>Hệ thống giám sát</small>
          </div>
        </div>
        <nav aria-label="Điều hướng chính">
          {navigation.filter((item) => user && item.roles.includes(user.role)).map((item) => item.disabled
            ? <span key={item.to} className="nav-item disabled">{item.label}<small>Sắp có</small></span>
            : <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>{item.label}</NavLink>)}
          {user?.role === 'ADMIN' && <><span className="nav-section">Cài đặt</span><NavLink to="/settings/rooms" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>Phòng thi</NavLink></>}
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">EXAMGUARD</p>
            <strong>Nền tảng quản lý phòng thi</strong>
          </div>
          <div className="account-block">
            <span>{user?.full_name ?? user?.username}</span>
            <small>{user ? roleLabels[user.role] : ''}</small>
            <button type="button" onClick={logout}>Đăng xuất</button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}
