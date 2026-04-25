const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogPayload {
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  timestamp: string
}

function send(payload: LogPayload): void {
  fetch(`${API_URL}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const payload: LogPayload = { level, message, context, timestamp: new Date().toISOString() }
  if (import.meta.env.DEV) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.info
    fn(`[${level.toUpperCase()}] ${message}`, context ?? '')
  }
  send(payload)
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => log('info',  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => log('warn',  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
}
