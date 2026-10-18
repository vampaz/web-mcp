import { readFileSync } from 'node:fs'
import { getStatePaths } from '@vampaz/vite-plugin-local-tls/testing'
import { getCACertificates, setDefaultCACertificates } from 'node:tls'

// Select the active CA; older local CAs can share its issuer name.
setDefaultCACertificates([
  ...getCACertificates('bundled'),
  readFileSync(getStatePaths().caCertificatePath, 'utf8')
])
