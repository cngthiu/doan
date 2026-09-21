import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../../features/auth/AuthProvider'

const navigation = [
  { label: 'Monitoring', to: '/', end: true },
  { label: 'Phiên thi', to: '/sessions' },
  { label: 'Thí sinh', to: '/candidates' },
  { label: 'Sự kiện', to: '/events', disabled: true },
  { label: 'Báo cáo', to: '/reports', disabled: true },
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
            <small>Surveillance system</small>
          </div>
        </div>
        <nav aria-label="Điều hướng chính">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}>
              {item.label}{item.disabled && <small>Phase sau</small>}
            </NavLink>
          ))}
          <span className="nav-section">Cài đặt</span>
          <NavLink to="/settings/rooms" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>Phòng thi</NavLink>
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
            <small>{user?.role}</small>
            <button type="button" onClick={logout}>Đăng xuất</button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}
