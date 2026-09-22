import { describe, expect, it } from 'vitest'

import { permissions } from '../features/auth/permissions'
import { canAccessRoute, landingPathForRole, navigationForRole, requiredPermissionForPath } from './access'

describe('role-aware application access', () => {
  it('uses the expected landing page for each role', () => {
    expect(landingPathForRole('ADMIN')).toBe('/overview')
    expect(landingPathForRole('SUPERVISOR')).toBe('/monitoring')
    expect(landingPathForRole('REVIEWER')).toBe('/sessions')
  })

  it('shows operational navigation to supervisors without settings', () => {
    const items = navigationForRole('SUPERVISOR')
    expect(items.map((item) => item.label)).toEqual(['Giám sát', 'Phiên thi', 'Thí sinh'])
    expect(items.some((item) => item.to.startsWith('/settings'))).toBe(false)
  })

  it('shows only implemented read-only navigation to reviewers', () => {
    const items = navigationForRole('REVIEWER')
    expect(items.map((item) => item.label)).toEqual(['Phiên thi', 'Thí sinh'])
    expect(items.some((item) => item.to === '/monitoring')).toBe(false)
    expect(items.some((item) => item.to.startsWith('/settings'))).toBe(false)
  })

  it('shows overview and room settings to administrators', () => {
    const items = navigationForRole('ADMIN')
    expect(items.some((item) => item.to === '/overview')).toBe(true)
    expect(items.some((item) => item.to === '/settings/rooms')).toBe(true)
    expect(items.some((item) => item.to === '/settings/users')).toBe(true)
    expect(items.some((item) => item.to === '/settings/audit')).toBe(true)
  })

  it('protects direct routes using centralized route metadata', () => {
    expect(requiredPermissionForPath('/sessions/abc')).toBe(permissions.sessionRead)
    expect(canAccessRoute('SUPERVISOR', '/settings/rooms')).toBe(false)
    expect(canAccessRoute('REVIEWER', '/settings/rooms')).toBe(false)
    expect(canAccessRoute('ADMIN', '/settings/rooms')).toBe(true)
    expect(canAccessRoute('SUPERVISOR', '/settings/users')).toBe(false)
    expect(canAccessRoute('ADMIN', '/settings/users')).toBe(true)
    expect(canAccessRoute('REVIEWER', '/settings/audit')).toBe(false)
    expect(canAccessRoute('ADMIN', '/settings/audit')).toBe(true)
  })
})
