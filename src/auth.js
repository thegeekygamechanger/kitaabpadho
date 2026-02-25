const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function sign(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function safeCompare(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(key).toString('hex')}`;
}

async function verifyPassword(password, passwordHash) {
  const [algo, salt, storedHex] = String(passwordHash || '').split('$');
  if (algo !== 'scrypt' || !salt || !storedHex) return false;
  const key = await scryptAsync(password, salt, 64);
  const computedHex = Buffer.from(key).toString('hex');
  return safeCompare(computedHex, storedHex);
}

function createSessionToken(user, secret, ttlSeconds) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = {
    uid: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role || 'student',
    exp: expiresAt
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token, secret) {
  if (!token || !secret) return null;
  const [encodedPayload, signature] = String(token).split('.');
  if (!encodedPayload || !signature) return null;
  const expected = sign(encodedPayload, secret);
  if (!safeCompare(signature, expected)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8'));
    if (!payload?.uid || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: config.sessionTtlSeconds * 1000,
    path: '/'
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  sessionCookieOptions
};
