#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const logDir = path.join(process.cwd(), 'logs')

// 获取今天的日志文件
const today = new Date().toISOString().split('T')[0]
const logFile = path.join(logDir, `eeat-${today}.log`)

function showHelp() {
  console.log(`
📋 EEAT评估系统日志查看器

使用方法:
  node scripts/view-logs.js [选项]

选项:
  -t, --today     显示今天的日志 (默认)
  -y, --yesterday 显示昨天的日志
  -f, --follow    实时跟踪日志
  -h, --help      显示帮助信息

示例:
  node scripts/view-logs.js              # 查看今天日志
  node scripts/view-logs.js -f           # 实时跟踪日志
  node scripts/view-logs.js --yesterday  # 查看昨天日志
`)
}

function getLogFile(date) {
  return path.join(logDir, `eeat-${date}.log`)
}

function showLogs(logPath, follow = false) {
  if (!fs.existsSync(logPath)) {
    console.log(`❌ 日志文件不存在: ${logPath}`)
    console.log(`💡 提示: 请确保已经使用系统并启用日志功能`)
    return
  }

  console.log(`📋 正在查看日志: ${logPath}`)
  console.log('=' .repeat(80))

  if (follow) {
    // 实时跟踪需要 fs.watch 或使用 tail -f
    console.log('实时跟踪功能需要使用系统的 tail 命令:')
    console.log(`tail -f "${logPath}"`)
    return
  }

  try {
    const content = fs.readFileSync(logPath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length === 0) {
      console.log('📝 暂无日志记录')
      return
    }

    lines.forEach(line => {
      try {
        const log = JSON.parse(line)
        const icon = {
          info: '🔵',
          error: '🔴',
          warn: '🟡'
        }[log.type] || '⚪'

        console.log(`${icon} [${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}`)
        if (log.data) {
          console.log(`   数据: ${JSON.stringify(log.data, null, 2)}`)
        }
        console.log()
      } catch (e) {
        console.log(line)
      }
    })
  } catch (error) {
    console.error(`❌ 读取日志文件失败: ${error.message}`)
  }
}

// 主程序
const args = process.argv.slice(2)
let date = today
let follow = false

// 解析参数
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '-h':
    case '--help':
      showHelp()
      process.exit(0)
      break
    case '-t':
    case '--today':
      date = today
      break
    case '-y':
    case '--yesterday':
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      date = yesterday.toISOString().split('T')[0]
      break
    case '-f':
    case '--follow':
      follow = true
      break
    default:
      console.log(`❌ 未知参数: ${args[i]}`)
      showHelp()
      process.exit(1)
  }
}

// 确保日志目录存在
if (!fs.existsSync(logDir)) {
  console.log('📝 日志目录不存在，系统可能还未启用日志功能')
  console.log('💡 提示: API评估记录会显示在运行控制台中')
  process.exit(0)
}

showLogs(getLogFile(date), follow)