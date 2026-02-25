const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');

function parseCookie(setCookieHeader) {
  return String(setCookieHeader || '').split(';')[0];
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createMockRepo() {
  let userId = 0;
  let listingId = 0;
  let mediaId = 0;
  let postId = 0;
  let commentId = 0;
  let actionId = 0;
  const users = [];
  const listings = [];
  const mediaAssets = [];
  const categories = [
    { id: 1, slug: 'books-and-notes', name: 'Books & Notes', description: '' },
    { id: 2, slug: 'instruments-and-tools', name: 'Instruments & Tools', description: '' },
    { id: 3, slug: 'helping-hands', name: 'Helping Hands', description: '' }
  ];
  const posts = [];
  const comments = [];
  const actions = [];

  return {
    async findUserByEmail(email) {
      return users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
    },
    async findUserById(id) {
      return users.find((u) => Number(u.id) === Number(id)) || null;
    },
    async createUser({ email, fullName, passwordHash }) {
      const user = { id: ++userId, email, fullName, passwordHash, role: 'student' };
      users.push(user);
      return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
    },
    async setUserRole(id, role) {
      const user = users.find((item) => Number(item.id) === Number(id));
      if (!user) return null;
      user.role = role;
      return { id: user.id, role: user.role };
    },
    async createProjectAction({
      actorId = null,
      actorEmail = '',
      actorRole = '',
      actionType,
      entityType,
      entityId = null,
      summary,
      details = {},
      ipAddress = '',
      userAgent = ''
    }) {
      const action = {
        id: ++actionId,
        actorId,
        actorEmail,
        actorRole,
        actionType,
        entityType,
        entityId,
        summary,
        details,
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString()
      };
      actions.push(action);
      return action;
    },
    async listProjectActions(filters) {
      let rows = actions.map((action) => {
        const user = users.find((item) => Number(item.id) === Number(action.actorId));
        return {
          ...action,
          actorName: user?.fullName || '',
          actorEmail: user?.email || action.actorEmail || '',
          actorRole: action.actorRole || user?.role || ''
        };
      });

      if (filters.q) {
        const q = String(filters.q).toLowerCase();
        rows = rows.filter((row) =>
          [row.summary, row.actorEmail].some((value) => String(value || '').toLowerCase().includes(q))
        );
      }
      if (filters.actionType) rows = rows.filter((row) => row.actionType === filters.actionType);
      if (filters.entityType) rows = rows.filter((row) => row.entityType === filters.entityType);
      if (filters.actorId) rows = rows.filter((row) => Number(row.actorId) === Number(filters.actorId));

      rows.sort((a, b) => Number(b.id) - Number(a.id));
      return rows.slice(filters.offset, filters.offset + filters.limit);
    },
    async countProjectActions(filters) {
      const rows = await this.listProjectActions({ ...filters, limit: 10000, offset: 0 });
      return rows.length;
    },
    async getAdminSummary() {
      const threshold = Date.now() - 24 * 60 * 60 * 1000;
      return {
        users: users.length,
        listings: listings.length,
        communityPosts: posts.length,
        communityComments: comments.length,
        actionsTotal: actions.length,
        actionsLast24h: actions.filter((action) => new Date(action.createdAt).getTime() >= threshold).length
      };
    },
    async listListings(filters) {
      let rows = listings.map((listing) => ({
        ...listing,
        ownerName: users.find((u) => u.id === listing.createdBy)?.fullName || 'Student',
        media: mediaAssets.filter((m) => m.listingId === listing.id)
      }));

      if (filters.q) {
        const q = filters.q.toLowerCase();
        rows = rows.filter((row) =>
          [row.title, row.description, row.city].some((value) => String(value).toLowerCase().includes(q))
        );
      }
      if (filters.category) rows = rows.filter((row) => row.category === filters.category);
      if (filters.listingType) rows = rows.filter((row) => row.listingType === filters.listingType);
      if (filters.city) {
        rows = rows.filter((row) => row.city.toLowerCase().includes(String(filters.city).toLowerCase()));
      }
      if (filters.areaCode && filters.areaCode !== 'all') {
        rows = rows.filter((row) => row.areaCode === filters.areaCode);
      }
      if (typeof filters.lat === 'number' && typeof filters.lon === 'number') {
        rows = rows.map((row) => ({
          ...row,
          distanceKm: distanceKm(filters.lat, filters.lon, row.latitude, row.longitude)
        }));
      }

      if (filters.sort === 'price_asc') rows.sort((a, b) => Number(a.price) - Number(b.price));
      if (filters.sort === 'price_desc') rows.sort((a, b) => Number(b.price) - Number(a.price));
      if (filters.sort === 'distance') {
        rows.sort((a, b) => Number(a.distanceKm || Infinity) - Number(b.distanceKm || Infinity));
      }
      if (!filters.sort || filters.sort === 'newest') {
        rows.sort((a, b) => Number(b.id) - Number(a.id));
      }
      return rows.slice(filters.offset, filters.offset + filters.limit);
    },
    async countListings(filters) {
      const data = await this.listListings({ ...filters, limit: 10000, offset: 0 });
      return data.length;
    },
    async createListing(data) {
      const listing = {
        id: ++listingId,
        title: data.title,
        description: data.description,
        category: data.category,
        listingType: data.listingType,
        price: data.price,
        city: data.city,
        areaCode: data.areaCode,
        latitude: data.latitude,
        longitude: data.longitude,
        createdBy: data.createdBy,
        createdAt: new Date().toISOString()
      };
      listings.push(listing);
      return listing;
    },
    async getListingById(id) {
      const listing = listings.find((l) => Number(l.id) === Number(id));
      if (!listing) return null;
      const owner = users.find((u) => u.id === listing.createdBy);
      return {
        ...listing,
        ownerName: owner?.fullName || 'Student',
        ownerEmail: owner?.email || '',
        media: mediaAssets.filter((m) => m.listingId === listing.id)
      };
    },
    async getListingOwner(listingIdParam) {
      const listing = listings.find((l) => Number(l.id) === Number(listingIdParam));
      if (!listing) return null;
      return { id: listing.id, createdBy: listing.createdBy };
    },
    async createListingMedia({ listingId: lid, key, url, mediaType }) {
      const media = {
        id: ++mediaId,
        listingId: lid,
        key,
        url,
        mediaType,
        createdAt: new Date().toISOString()
      };
      mediaAssets.push(media);
      return media;
    },
    async listCommunityCategories() {
      return categories;
    },
    async findCommunityCategoryBySlug(slug) {
      return categories.find((c) => c.slug === slug) || null;
    },
    async listCommunityPosts(filters) {
      let rows = posts.map((post) => ({
        ...post,
        categorySlug: categories.find((c) => c.id === post.categoryId)?.slug || '',
        categoryName: categories.find((c) => c.id === post.categoryId)?.name || '',
        authorName: users.find((u) => u.id === post.createdBy)?.fullName || '',
        commentCount: comments.filter((comment) => comment.postId === post.id).length
      }));

      if (filters.q) {
        const q = filters.q.toLowerCase();
        rows = rows.filter((post) =>
          [post.title, post.content].some((value) => String(value).toLowerCase().includes(q))
        );
      }
      if (filters.categorySlug) rows = rows.filter((post) => post.categorySlug === filters.categorySlug);
      rows.sort((a, b) => Number(b.id) - Number(a.id));
      return rows.slice(filters.offset, filters.offset + filters.limit);
    },
    async countCommunityPosts(filters) {
      const rows = await this.listCommunityPosts({ ...filters, limit: 10000, offset: 0 });
      return rows.length;
    },
    async createCommunityPost({ title, content, categoryId, createdBy }) {
      const post = {
        id: ++postId,
        title,
        content,
        categoryId,
        createdBy,
        createdAt: new Date().toISOString()
      };
      posts.push(post);
      return post;
    },
    async getCommunityPostById(id) {
      const post = posts.find((row) => Number(row.id) === Number(id));
      if (!post) return null;
      return {
        id: post.id,
        title: post.title,
        content: post.content,
        createdAt: post.createdAt,
        createdBy: post.createdBy,
        categorySlug: categories.find((cat) => cat.id === post.categoryId)?.slug || '',
        categoryName: categories.find((cat) => cat.id === post.categoryId)?.name || '',
        authorName: users.find((user) => user.id === post.createdBy)?.fullName || '',
        comments: comments
          .filter((comment) => comment.postId === post.id)
          .map((comment) => ({
            ...comment,
            authorName: users.find((user) => user.id === comment.createdBy)?.fullName || ''
          }))
      };
    },
    async createCommunityComment({ postId: pid, createdBy, content }) {
      const comment = {
        id: ++commentId,
        postId: pid,
        createdBy,
        content,
        createdAt: new Date().toISOString()
      };
      comments.push(comment);
      return comment;
    },
    async deleteCommunityComment(id, userIdParam) {
      const index = comments.findIndex((comment) => comment.id === Number(id) && comment.createdBy === Number(userIdParam));
      if (index < 0) return null;
      const [deleted] = comments.splice(index, 1);
      return { id: deleted.id };
    }
  };
}

async function startServer(t, app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  return `http://127.0.0.1:${port}`;
}

async function json(response) {
  return response.json();
}

test('API smoke coverage for health/auth/listings/community/ai/location', async (t) => {
  const repo = createMockRepo();
  const app = createApp({
    repo,
    askAiFn: async (prompt) => ({ provider: 'mock-ai', text: `Echo: ${prompt}` }),
    uploadMediaFn: async ({ key }) => ({ key, url: `https://example.local/${key}` }),
    r2Enabled: true,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { display_name: 'Hadapsar, Pune, Maharashtra, India' };
      }
    })
  });
  const baseUrl = await startServer(t, app);

  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthRes.status, 200);
  assert.equal((await json(healthRes)).ok, true);

  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Harsh Kumar',
      email: 'harsh@example.com',
      password: 'StrongPass#123'
    })
  });
  assert.equal(registerRes.status, 201);
  const authCookie = parseCookie(registerRes.headers.get('set-cookie'));
  assert.ok(authCookie.includes('kp_session='));

  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: authCookie }
  });
  const meJson = await json(meRes);
  assert.equal(meJson.authenticated, true);
  assert.equal(meJson.user.email, 'harsh@example.com');

  const listingRes = await fetch(`${baseUrl}/api/listings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: authCookie
    },
    body: JSON.stringify({
      title: 'Signals and Systems Book',
      description: 'Good condition. 2nd year syllabus.',
      category: 'book',
      listingType: 'sell',
      price: 350,
      city: 'Pune',
      areaCode: 'hadapsar',
      latitude: 18.5089,
      longitude: 73.926
    })
  });
  assert.equal(listingRes.status, 201);
  const listing = await json(listingRes);

  const formData = new FormData();
  formData.append('file', new Blob(['image-bytes'], { type: 'image/png' }), 'cover.png');
  const mediaRes = await fetch(`${baseUrl}/api/listings/${listing.id}/media`, {
    method: 'POST',
    headers: { cookie: authCookie },
    body: formData
  });
  assert.equal(mediaRes.status, 200);
  assert.equal((await json(mediaRes)).r2Enabled, true);

  const listingsRes = await fetch(
    `${baseUrl}/api/listings?listingType=sell&areaCode=hadapsar&lat=18.50&lon=73.90&sort=distance`
  );
  assert.equal(listingsRes.status, 200);
  const listingsJson = await json(listingsRes);
  assert.equal(listingsJson.data.length, 1);
  assert.equal(listingsJson.data[0].listingType, 'sell');

  const postRes = await fetch(`${baseUrl}/api/community/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: authCookie
    },
    body: JSON.stringify({
      title: 'Need exam notes for DSP',
      categorySlug: 'books-and-notes',
      content: 'Anyone near Hadapsar who can share DSP notes this weekend?'
    })
  });
  assert.equal(postRes.status, 201);
  const postJson = await json(postRes);

  const commentRes = await fetch(`${baseUrl}/api/community/posts/${postJson.id}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: authCookie
    },
    body: JSON.stringify({ content: 'Yes, I can share tomorrow.' })
  });
  assert.equal(commentRes.status, 201);
  const commentJson = await json(commentRes);

  const deleteCommentRes = await fetch(`${baseUrl}/api/community/comments/${commentJson.id}`, {
    method: 'DELETE',
    headers: { cookie: authCookie }
  });
  assert.equal(deleteCommentRes.status, 200);

  const aiRes = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Recommend rent options in Hadapsar' })
  });
  assert.equal(aiRes.status, 200);
  assert.equal((await json(aiRes)).provider, 'mock-ai');

  const locationRes = await fetch(`${baseUrl}/api/location/nearby?lat=18.5089&lon=73.926`);
  assert.equal(locationRes.status, 200);
  assert.match((await json(locationRes)).current.address, /Hadapsar/);

  const adminDeniedRes = await fetch(`${baseUrl}/api/admin/actions`, {
    headers: { cookie: authCookie }
  });
  assert.equal(adminDeniedRes.status, 403);

  await repo.setUserRole(meJson.user.id, 'admin');
  const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'harsh@example.com',
      password: 'StrongPass#123'
    })
  });
  assert.equal(adminLoginRes.status, 200);
  const adminCookie = parseCookie(adminLoginRes.headers.get('set-cookie'));

  const adminSummaryRes = await fetch(`${baseUrl}/api/admin/summary`, {
    headers: { cookie: adminCookie }
  });
  assert.equal(adminSummaryRes.status, 200);
  const adminSummary = await json(adminSummaryRes);
  assert.equal(adminSummary.users, 1);
  assert.ok(adminSummary.actionsTotal >= 1);

  const adminActionsRes = await fetch(`${baseUrl}/api/admin/actions?limit=10&offset=0`, {
    headers: { cookie: adminCookie }
  });
  assert.equal(adminActionsRes.status, 200);
  const adminActions = await json(adminActionsRes);
  assert.ok(Array.isArray(adminActions.data));
  assert.ok(adminActions.data.length >= 1);

  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie: adminCookie }
  });
  assert.equal(logoutRes.status, 200);
  const clearedCookie = parseCookie(logoutRes.headers.get('set-cookie'));
  const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: clearedCookie }
  });
  assert.equal((await json(meAfterLogout)).authenticated, false);
});
