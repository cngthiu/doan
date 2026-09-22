import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../../features/auth/AuthProvider'
import type { UserRole } from '../../features/auth/types'
import { Icon, type IconName } from '../components/Icon'
import { roleLabels } from '../i18n/vi'

const navigation = [
  { label: 'Giám sát', to: '/', icon: 'camera', end: true, roles: ['SUPERVISOR', 'ADMIN'] as UserRole[] },
  { label: 'Phiên thi', to: '/sessions', icon: 'calendar', roles: ['SUPERVISOR', 'REVIEWER', 'ADMIN'] as UserRole[] },
  { label: 'Sự kiện', to: '/events', icon: 'clipboard', disabled: true, roles: ['REVIEWER', 'ADMIN'] as UserRole[] },
  { label: 'Thí sinh', to: '/candidates', icon: 'users', roles: ['SUPERVISOR', 'REVIEWER', 'ADMIN'] as UserRole[] },
  { label: 'Báo cáo', to: '/reports', icon: 'chart', disabled: true, roles: ['ADMIN'] as UserRole[] },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const displayName = user?.full_name ?? user?.username ?? ''
  const initials = displayName.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join('') || 'EG'

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="sidebar" aria-label="Thanh điều hướng">
        <div className="brand-row">
          <span className="brand-badge small"><Icon name="shield" /></span>
          <div>
            <strong>ExamGuard</strong>
            <small>EXAM MONITORING</small>
          </div>
        </div>
        <div className="sidebar-user">
          <span className="user-avatar">{initials}</span>
          <span><strong>{displayName}</strong><small>{user ? roleLabels[user.role] : ''}</small></span>
        </div>
        <p className="nav-header">QUẢN LÝ HỆ THỐNG</p>
        <nav aria-label="Điều hướng chính">
          {navigation.filter((item) => user && item.roles.includes(user.role)).map((item) => item.disabled
            ? <span key={item.to} className="nav-item disabled"><Icon name={item.icon as IconName} /><span>{item.label}</span><small>Sắp có</small></span>
            : <NavLink key={item.to} to={item.to} end={item.end} onClick={closeSidebar} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon as IconName} /><span>{item.label}</span><Icon className="nav-chevron" name="chevron" /></NavLink>)}
          {user?.role === 'ADMIN' && <><span className="nav-section">Cấu hình</span><NavLink to="/settings/rooms" onClick={closeSidebar} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name="door" /><span>Phòng thi</span><Icon className="nav-chevron" name="chevron" /></NavLink></>}
        </nav>
      </aside>
      <button className="sidebar-backdrop" type="button" aria-label="Đóng thanh điều hướng" onClick={closeSidebar} />
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-start">
            <button className="menu-toggle" type="button" aria-label="Mở thanh điều hướng" onClick={() => setSidebarOpen((value) => !value)}><Icon name="bars" /></button>
            <div><strong>Hệ thống giám sát phòng thi</strong><small>Điều hành và theo dõi tập trung</small></div>
          </div>
          <div className="account-block">
            <span className="topbar-avatar">{initials}</span>
            <span className="account-copy"><strong>{displayName}</strong><small>{user ? roleLabels[user.role] : ''}</small></span>
            <button type="button" onClick={logout}><Icon name="logout" />Đăng xuất</button>
          </div>
        </header>
        <main className="content-wrapper"><Outlet /></main>
        <footer className="main-footer"><span><strong>ExamGuard</strong> · Giám sát phòng thi</span><span>Phiên bản 1.0</span></footer>
      </div>
    </div>
  )
}
