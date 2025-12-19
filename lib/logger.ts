import fs from 'fs'
import path from 'path'

// 创建日志目录
const logDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// 日志函数
export function writeLog(type: 'info' | 'error' | 'warn', message: string, data?: any) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    type,
    message,
    ...(data && { data })
  }

  // 写入到日志文件
  const logFile = path.join(logDir, `eeat-${new Date().toISOString().split('T')[0]}.log`)
  const logLine = JSON.stringify(logEntry) + '\n'

  try {
    fs.appendFileSync(logFile, logLine)
  } catch (error) {
    console.error('无法写入日志:', error)
  }

  // 同时输出到控制台
  const prefix = {
    info: '[INFO]',
    error: '[ERROR]',
    warn: '[WARN]'
  }[type]

  console.log(`${prefix} ${timestamp} ${message}`, data || '')
}

// 导出便捷方法
export const logger = {
  info: (message: string, data?: any) => writeLog('info', message, data),
  error: (message: string, data?: any) => writeLog('error', message, data),
  warn: (message: string, data?: any) => writeLog('warn', message, data)
}