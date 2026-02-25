const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listingSchema,
  listingQuerySchema,
  communityPostSchema,
  communityCommentSchema
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
