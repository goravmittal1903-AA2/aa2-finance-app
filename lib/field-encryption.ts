import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey() {
  const encoded = process.env.FIELD_ENCRYPTION_KEY_BASE64
  if (!encoded) throw new Error('FIELD_ENCRYPTION_KEY_BASE64 is not configured.')
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes.')
  return key
}

/** Encrypts sensitive fields using AES-256-GCM with authenticated metadata. */
export function encryptField(value: string, aad: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map(part => part.toString('base64url')).join('.')
}

export function decryptField(payload: string, aad: string) {
  const [ivPart, tagPart, encryptedPart] = payload.split('.')
  if (!ivPart || !tagPart || !encryptedPart) throw new Error('Invalid encrypted field payload.')
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, 'base64url'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
