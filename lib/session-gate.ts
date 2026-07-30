export type GatePurpose = 'pending' | 'verified' | 'recovery'

interface GatePayload {
  purpose: GatePurpose
  email: string
  userId?: string
  exp: number
}

function getSecret() {
  const secret = process.env.AUTH_CHALLENGE_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_CHALLENGE_SECRET must be set to a value of at least 32 characters.')
  }
  return secret
}

function encode(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decode(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(base64)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function signingKey() {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(getSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function createGateToken(purpose: GatePurpose, email: string, userId?: string, lifetimeSeconds = 600) {
  const payload: GatePayload = { purpose, email: email.toLowerCase(), userId, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds }
  const encodedPayload = encode(JSON.stringify(payload))
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(encodedPayload))
  return `${encodedPayload}.${encode(new Uint8Array(signature))}`
}

export async function readGateToken(token: string | undefined, purpose: GatePurpose) {
  if (!token) return null
  const [encodedPayload, encodedSignature] = token.split('.')
  if (!encodedPayload || !encodedSignature) return null
  try {
    const valid = await crypto.subtle.verify('HMAC', await signingKey(), decode(encodedSignature), new TextEncoder().encode(encodedPayload))
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(decode(encodedPayload))) as GatePayload
    if (payload.purpose !== purpose || payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
