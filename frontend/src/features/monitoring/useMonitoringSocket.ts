import { useEffect, useRef, useState } from 'react'

import type { MonitoringMessage } from './types'

export function monitoringSocketUrl(sessionId: string, location: Location = window.location): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ws/monitoring/${sessionId}`
}

export function reconnectDelay(attempt: number): number {
  return Math.min(500 * 2 ** Math.max(0, attempt), 5000)
}

export function shouldReconnect(code: number): boolean {
  return ![4401, 4403, 4404, 4409].includes(code)
}

interface SocketOptions {
  sessionId: string
  enabled: boolean
  onMessage(message: MonitoringMessage): void
}

export function useMonitoringSocket({ sessionId, enabled, onMessage }: SocketOptions) {
  const callbackRef = useRef(onMessage)
  const [connected, setConnected] = useState(false)
  callbackRef.current = onMessage

  useEffect(() => {
    if (!enabled || !sessionId) {
      setConnected(false)
      return
    }
    let socket: WebSocket | null = null
    let retryTimer = 0
    let attempt = 0
    let disposed = false
    const connect = () => {
      if (disposed) return
      socket = new WebSocket(monitoringSocketUrl(sessionId))
      socket.onopen = () => { attempt = 0; setConnected(true) }
      socket.onmessage = (event) => {
        try {
          callbackRef.current(JSON.parse(event.data as string) as MonitoringMessage)
        } catch {
          // A later valid latest-state message supersedes malformed transport data.
        }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = (event) => {
        setConnected(false)
        if (!disposed && shouldReconnect(event.code)) {
          retryTimer = window.setTimeout(connect, reconnectDelay(attempt))
          attempt += 1
        }
      }
    }
    connect()
    return () => {
      disposed = true
      window.clearTimeout(retryTimer)
      socket?.close()
    }
  }, [enabled, sessionId])
  return connected
}
