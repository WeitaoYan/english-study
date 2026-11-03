import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'

// Node 20.12+/22+ 不允许不带 shell 直接 spawn `.cmd`/`.bat`（CVE-2024-27980），
// Windows 上会抛 EINVAL。优先用当前 node 直接执行 npm-cli.js，避免依赖 shell。
const npmCli = process.env.npm_execpath?.endsWith('npm-cli.js')
  ? process.env.npm_execpath
  : null

const children = []
let shuttingDown = false

function run(label, args) {
  const command = npmCli ? process.execPath : isWindows ? 'npm.cmd' : 'npm'
  const commandArgs = npmCli ? [npmCli, ...args] : args
  const child = spawn(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: !npmCli && isWindows,
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    const reason = signal ? `signal ${signal}` : `code ${code}`
    console.log(`\n[dev] ${label} exited with ${reason}`)
    shutdown(typeof code === 'number' ? code : 1)
  })

  child.on('error', (error) => {
    console.error(`[dev] failed to start ${label}:`, error)
    shutdown(1)
  })

  children.push(child)
  return child
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.pid || child.killed) continue
    if (isWindows) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
      })
    } else {
      child.kill('SIGTERM')
    }
  }
  setTimeout(() => process.exit(code), 250)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('[dev] starting API (http://127.0.0.1:8787) and Web (http://localhost:3000)')
run('api', ['run', 'dev', '-w', '@english-study/api'])
run('web', ['run', 'dev', '-w', '@english-study/web'])
