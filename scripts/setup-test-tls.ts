import { execFile, spawn } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { access, mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'
import { getStatePaths, LocalTlsService } from '@vampaz/vite-plugin-local-tls/testing'

// Only disposable Linux CI hosts may install test CA trust automatically.
if (process.platform !== 'linux' || process.env.CI !== 'true' || !process.env.RUNNER_TEMP)
  throw new Error('TLS test setup requires a disposable Linux CI host with RUNNER_TEMP.')

const run = promisify(execFile)
const paths = getStatePaths('default')
const service = new LocalTlsService({ paths, opensslPath: 'openssl', port: 443 })
if ((await service.status()).running) throw new Error('CI requires an unused local TLS service.')

const logPath = join(process.env.RUNNER_TEMP, 'webmcp-test-tls.log')
const log = await open(logPath, 'w')
const daemon = spawn(
  process.execPath,
  ['node_modules/@vampaz/vite-plugin-local-tls/dist/cli.js', 'proxy', 'start', '--service'],
  { detached: true, stdio: ['ignore', log.fd, log.fd] }
)
daemon.unref()
await log.close()
for (let attempt = 0; !(await service.status()).running; attempt++) {
  if (attempt === 100 || daemon.exitCode !== null)
    throw new Error(`TLS daemon failed to start. See ${logPath}.`)
  await setTimeout(100)
}

const certificate = new X509Certificate(await readFile(paths.caCertificatePath))
const fingerprint = certificate.fingerprint256.replaceAll(':', '').toLowerCase()
await elevated('install', [
  '-m',
  '0644',
  paths.caCertificatePath,
  `/usr/local/share/ca-certificates/vite-local-tls-${fingerprint.slice(0, 12)}.crt`
])
await elevated('update-ca-certificates', [])

const nss = join(homedir(), '.pki', 'nssdb')
await mkdir(nss, { recursive: true })
try {
  await access(join(nss, 'cert9.db'))
} catch {
  await run('certutil', ['-N', '--empty-password', '-d', `sql:${nss}`])
}
await run('certutil', [
  '-A',
  '-d',
  `sql:${nss}`,
  '-n',
  'webmcp-test-tls',
  '-t',
  'C,,',
  '-i',
  paths.caCertificatePath
])

// Firefox on Linux uses its own certificate store. Install this exact test CA.
const policy = join(process.env.RUNNER_TEMP, 'webmcp-firefox-policies.json')
await writeFile(
  policy,
  JSON.stringify({ policies: { Certificates: { Install: [paths.caCertificatePath] } } }),
  { flag: 'wx' }
)
console.log(`Trusted test TLS CA ${fingerprint}. No startup service was installed.`)

async function elevated(command: string, arguments_: string[]) {
  if (process.getuid?.() === 0) await run(command, arguments_)
  else await run('sudo', ['--', command, ...arguments_])
}
