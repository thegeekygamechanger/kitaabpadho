const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken
} = require('../src/auth');

test('hashPassword and verifyPassword work with valid and invalid values', async () => {
  const password = 'StrongPass#123';
  const hash = await hashPassword(password);

  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});

test('session token is signed and verifiable', async () => {
  const secret = 'test-secret';
  const token = createSessionToken(
    {
      id: 42,
      email: 'user@example.com',
      fullName: 'Test User',
      role: 'student'
    },
    secret,
    60
  );

  const payload = verifySessionToken(token, secret);
  assert.equal(payload.uid, 42);
  assert.equal(payload.email, 'user@example.com');
  assert.equal(payload.fullName, 'Test User');
  assert.equal(payload.role, 'student');
});

test('session token fails verification on secret mismatch', async () => {
  const token = createSessionToken(
    { id: 1, email: 'x@y.z', fullName: 'X', role: 'student' },
    'secret-a',
    60
  );
  const payload = verifySessionToken(token, 'secret-b');
  assert.equal(payload, null);
});
