import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const npm = isWindows ? 'npm.cmd' : 'npm'

const children = []
let shuttingDown = false

function run(label, args) {
  const child = spawn(npm, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
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
