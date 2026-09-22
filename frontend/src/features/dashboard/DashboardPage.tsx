import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiContentErrorMessage } from '../../shared/api/errors'
import { ErrorState } from '../../shared/components/ErrorState'
import { LoadingState } from '../../shared/components/LoadingState'
import { PageHeader } from '../../shared/components/PageHeader'
import { useAuth } from '../auth/AuthProvider'
import { permissions, usePermissions } from '../auth/permissions'
import type { UserRole } from '../auth/types'
import { getSessions } from '../sessions/api'
import type { SessionStatus } from '../sessions/types'
import { getUsers } from '../users/api'

interface SessionCounts {
  total: number
  running: number
  paused: number
  ready: number
  draft: number
  activeUsers: number
}

const emptyCounts: SessionCounts = { total: 0, running: 0, paused: 0, ready: 0, draft: 0, activeUsers: 0 }

const dashboardCopy: Record<UserRole, { title: string; description: string; action: string; to: string }> = {
  ADMIN: { title: 'Tổng quan', description: 'Tình trạng phiên thi được cập nhật từ dữ liệu hệ thống.', action: 'Xem phiên thi', to: '/sessions' },
  SUPERVISOR: { title: 'Công việc giám sát', description: 'Tình trạng phiên thi được cập nhật từ dữ liệu hệ thống.', action: 'Bắt đầu giám sát', to: '/monitoring' },
  REVIEWER: { title: 'Thông tin phiên thi', description: 'Theo dõi các phiên thi ở chế độ chỉ đọc.', action: 'Xem phiên thi', to: '/sessions' },
}

async function countSessions(status?: SessionStatus): Promise<number> {
  return (await getSessions({ pageSize: 1, status })).total
}

export function DashboardPage() {
  const { user } = useAuth()
  const { can } = usePermissions()
  const canManageUsers = can(permissions.userManage)
  const [counts, setCounts] = useState<SessionCounts>(emptyCounts)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [total, running, paused, ready, draft, activeUsers] = await Promise.all([
        countSessions(), countSessions('RUNNING'), countSessions('PAUSED'), countSessions('READY'), countSessions('DRAFT'),
        canManageUsers ? getUsers({ pageSize: 1, active: 'true' }).then((page) => page.total) : Promise.resolve(0),
      ])
      setCounts({ total, running, paused, ready, draft, activeUsers })
    } catch (requestError) {
      setError(apiContentErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [canManageUsers])

  if (loading) return <LoadingState message="Đang tải tổng quan…" />

  const active = counts.running + counts.paused
  const copy = dashboardCopy[user?.role ?? 'ADMIN']

  return <div className="page-stack">
    <PageHeader
      eyebrow="TỔNG QUAN VẬN HÀNH"
      title={copy.title}
      description={copy.description}
      actions={<Link className="primary-button link-button" to={copy.to}>{copy.action}</Link>}
    />
    {error && <ErrorState message={error} onRetry={() => void load()} />}
    {!error && <section className="dashboard-summary" aria-label="Tóm tắt phiên thi">
      <div className="card dashboard-metric"><span>Phiên đang chạy</span><strong>{active}</strong><small>{counts.running} đang giám sát · {counts.paused} tạm dừng</small></div>
      <div className="card dashboard-metric"><span>Phiên sẵn sàng</span><strong>{counts.ready}</strong><small>Có thể bắt đầu giám sát</small></div>
      <div className="card dashboard-metric"><span>Phiên cần chuẩn bị</span><strong>{counts.draft}</strong><small>Đang ở trạng thái bản nháp</small></div>
      <div className="card dashboard-metric"><span>{canManageUsers ? 'Người dùng hoạt động' : 'Tổng số phiên'}</span><strong>{canManageUsers ? counts.activeUsers : counts.total}</strong><small>{canManageUsers ? 'Tài khoản có thể đăng nhập' : 'Tất cả trạng thái'}</small></div>
    </section>}
  </div>
}
