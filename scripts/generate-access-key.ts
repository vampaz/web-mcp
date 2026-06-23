import { issueAccessKey, type AccessKeyIssuerInput } from './access-key-issuer.ts'

function getArgument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv
    .find(function findArgument(argument) {
      return argument.startsWith(prefix)
    })
    ?.slice(prefix.length)
}

function getRequiredArgument(name: string): string {
  const value = getArgument(name)?.trim()
  if (!value) {
    throw new Error(`Missing --${name}`)
  }

  return value
}

const signingSecret =
  getArgument('issuer-secret') ?? process.env.WEBMCP_ACCESS_KEY_ISSUER_SECRET ?? ''

const input: AccessKeyIssuerInput = {
  allowedOrigins: getRequiredArgument('origins')
    .split(',')
    .map(function mapOrigin(origin) {
      return origin.trim()
    })
    .filter(Boolean),
  analyticsOptIn: getArgument('analytics-opt-in') === 'true',
  customerId: getRequiredArgument('customer'),
  environment: getArgument('environment') === 'live' ? 'live' : 'test',
  expiresAt: getArgument('expires-at'),
  projectId: getRequiredArgument('project'),
  services: getRequiredArgument('services')
    .split(',')
    .map(function mapService(serviceId) {
      return {
        serviceId: serviceId.trim()
      }
    })
}

const result = issueAccessKey(input, {
  signingSecret
})

console.log(
  JSON.stringify(
    {
      key: result.key,
      record: result.record
    },
    null,
    2
  )
)
