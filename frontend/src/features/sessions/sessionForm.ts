import type { ExamSession } from './types'

export const examDurationOptions = [45, 60, 90, 120] as const

export type ExamDurationMinutes = typeof examDurationOptions[number]

export function toLocalDateTimeInput(date: Date): string {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 16)
}

export function scheduledEnd(start: string | null, durationMinutes: ExamDurationMinutes): string | null {
  if (!start) return null
  const startDate = new Date(start)
  if (Number.isNaN(startDate.getTime())) return null
  return new Date(startDate.getTime() + durationMinutes * 60_000).toISOString()
}

export function nextSessionCode(sessions: Pick<ExamSession, 'session_code'>[], total: number): string {
  const latestNumberedCode = sessions
    .map((session) => /^(.*?)(\d+)$/.exec(session.session_code.trim()))
    .find((match) => match !== null)

  if (!latestNumberedCode) {
    return `PT-${String(total + 1).padStart(3, '0')}`
  }

  const prefix = latestNumberedCode[1]
  const width = latestNumberedCode[2].length
  const largestVisibleNumber = sessions.reduce((largest, session) => {
    const match = /^(.*?)(\d+)$/.exec(session.session_code.trim())
    return match?.[1] === prefix ? Math.max(largest, Number(match[2])) : largest
  }, 0)
  const nextNumber = Math.max(largestVisibleNumber, total) + 1
  return `${prefix}${String(nextNumber).padStart(width, '0')}`
}
