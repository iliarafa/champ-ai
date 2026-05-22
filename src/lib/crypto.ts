/**
 * Crypto utilities for Path 1 (Local-first cowork)
 *
 * Uses Web Crypto API (available in all modern browsers).
 * - Key derivation: PBKDF2 (SHA-256, 150k+ iterations)
 * - Symmetric encryption: AES-GCM 256-bit
 *
 * Design goals:
 * - Simple string <-> encrypted string API
 * - No external dependencies
 * - Good defaults for passphrase-based encryption
 */

const PBKDF2_ITERATIONS = 210000 // strong but still fast enough in browser
const SALT_LENGTH = 16
const IV_LENGTH = 12 // recommended for AES-GCM

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes as Uint8Array<ArrayBuffer>
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts a UTF-8 string with an optional passphrase.
 * If no password is provided, returns the original string (no encryption).
 */
export async function encryptString(
  plaintext: string,
  password?: string
): Promise<{ ciphertext: string; salt?: string; iv?: string }> {
  if (!password) {
    return { ciphertext: plaintext }
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(password, salt)

  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  )

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
  }
}

/**
 * Decrypts a payload created by encryptString.
 * If the payload was not encrypted (no salt/iv), returns it as-is.
 */
export async function decryptString(
  payload: { ciphertext: string; salt?: string; iv?: string },
  password?: string
): Promise<string> {
  // Unencrypted payload
  if (!payload.salt || !payload.iv) {
    return payload.ciphertext
  }

  if (!password) {
    throw new Error('Password is required to decrypt this payload')
  }

  const salt = base64ToBytes(payload.salt)
  const iv = base64ToBytes(payload.iv)
  const key = await deriveKey(password, salt)

  const ciphertext = base64ToBytes(payload.ciphertext)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  )

  const dec = new TextDecoder()
  return dec.decode(decrypted)
}