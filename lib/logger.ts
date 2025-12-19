import fs from 'fs'
import path from 'path'

// 检测是否在生产环境（Vercel）
const isProduction = process.env.NODE_ENV === 'production'
const isVercel = process.env.VERCEL === '1'

// 只在非生产环境创建日志目录
let logDir: string | null = null
if (!isProduction && !isVercel) {
  logDir = path.join(process.cwd(), 'logs')
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
  } catch (error) {
    // 忽略目录创建错误
  }
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

  // 只在非生产环境且日志目录存在时写入文件
  if (logDir && !isProduction && !isVercel) {
    const logFile = path.join(logDir, `eeat-${new Date().toISOString().split('T')[0]}.log`)
    const logLine = JSON.stringify(logEntry) + '\n'

    try {
      fs.appendFileSync(logFile, logLine)
    } catch (error) {
      // 静默处理文件写入错误
    }
  }

  // 始终输出到控制台
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