const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listingSchema,
  listingQuerySchema,
  authLoginSchema,
  authRegisterSchema,
  communityPostSchema,
  communityCommentSchema,
  adminActionQuerySchema
} = require('../src/validators');

test('listingSchema accepts sell listing with area code', () => {
  const parsed = listingSchema.parse({
    title: 'Engineering Drawing Instruments Kit',
    description: 'Used but in good condition.',
    category: 'instrument',
    listingType: 'sell',
    price: 850,
    city: 'Pune',
    areaCode: 'hadapsar',
    latitude: 18.5,
    longitude: 73.9
  });

  assert.equal(parsed.listingType, 'sell');
  assert.equal(parsed.areaCode, 'hadapsar');
});

test('listingQuerySchema parses and validates filters', () => {
  const parsed = listingQuerySchema.parse({
    q: 'maths',
    listingType: 'rent',
    areaCode: 'camp',
    lat: '18.53',
    lon: '73.91',
    sort: 'distance',
    limit: '20',
    offset: '0'
  });

  assert.equal(parsed.listingType, 'rent');
  assert.equal(parsed.areaCode, 'camp');
  assert.equal(parsed.lat, 18.53);
  assert.equal(parsed.sort, 'distance');
});

test('community validation allows safe payload limits', () => {
  const post = communityPostSchema.parse({
    title: 'Need notes for Signals and Systems',
    content: 'Anyone near Camp area who can share short notes for this week test?',
    categorySlug: 'books-and-notes'
  });
  const comment = communityCommentSchema.parse({
    content: 'I have a PDF set. Ping me.'
  });

  assert.equal(post.categorySlug, 'books-and-notes');
  assert.equal(comment.content, 'I have a PDF set. Ping me.');
});

test('community validation blocks malformed category slug', () => {
  assert.throws(() =>
    communityPostSchema.parse({
      title: 'Topic',
      content: 'This content is long enough to pass text checks.',
      categorySlug: 'invalid slug'
    })
  );
});

test('adminActionQuerySchema parses optional filters safely', () => {
  const parsed = adminActionQuerySchema.parse({
    q: 'listing',
    actionType: 'listing.create',
    entityType: 'listing',
    actorId: '8',
    limit: '25',
    offset: '5'
  });

  assert.equal(parsed.actionType, 'listing.create');
  assert.equal(parsed.entityType, 'listing');
  assert.equal(parsed.actorId, 8);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.offset, 5);
});

test('authLoginSchema accepts password or totpCode', () => {
  const passwordLogin = authLoginSchema.parse({
    email: 'x@y.com',
    password: 'StrongPass#123'
  });
  const totpLogin = authLoginSchema.parse({
    email: 'x@y.com',
    totpCode: '123456'
  });

  assert.equal(passwordLogin.email, 'x@y.com');
  assert.equal(totpLogin.totpCode, '123456');
  assert.throws(() =>
    authLoginSchema.parse({
      email: 'x@y.com'
    })
  );
});

test('authRegisterSchema validates optional totp pair', () => {
  const withTotp = authRegisterSchema.parse({
    fullName: 'A User',
    email: 'a@b.com',
    phoneNumber: '9876543210',
    password: 'StrongPass#123',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    totpCode: '123456'
  });

  assert.equal(withTotp.totpSecret, 'JBSWY3DPEHPK3PXP');

  assert.throws(() =>
    authRegisterSchema.parse({
      fullName: 'A User',
      email: 'a@b.com',
      phoneNumber: '9876543210',
      password: 'StrongPass#123',
      totpSecret: 'JBSWY3DPEHPK3PXP'
    })
  );
});
