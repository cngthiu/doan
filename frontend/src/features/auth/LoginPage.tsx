import axios from 'axios'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { ErrorState } from '../../shared/components/ErrorState'
import { useAuth } from './AuthProvider'

function loginErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    return 'Tên đăng nhập hoặc mật khẩu không đúng.'
  }
  return 'Không thể kết nối tới ExamGuard. Vui lòng thử lại.'
}

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(loginErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-badge">E</div>
        <p className="eyebrow">EXAMGUARD</p>
        <h1 id="login-title">Đăng nhập hệ thống</h1>
        <p className="secondary-text">Nền tảng giám sát và rà soát phòng thi</p>
        {error && <ErrorState message={error} />}
        <form onSubmit={submit}>
          <label htmlFor="username">Tên đăng nhập</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </section>
    </main>
  )
}
