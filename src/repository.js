function createRepository(queryFn) {
  if (typeof queryFn !== 'function') {
    throw new Error('queryFn is required');
  }

  const run = (text, params = []) => queryFn(text, params);

  return {
    async findUserByEmail(email) {
      const result = await run(
        `SELECT
          id,
          email,
          full_name AS "fullName",
          password_hash AS "passwordHash",
          role,
          totp_enabled AS "totpEnabled",
          totp_secret AS "totpSecret",
          totp_pending_secret AS "totpPendingSecret"
         FROM users
         WHERE lower(email) = lower($1)
         LIMIT 1`,
        [email]
      );
      return result.rows[0] || null;
    },

    async findUserById(id) {
      const result = await run(
        `SELECT
          id,
          email,
          full_name AS "fullName",
          role,
          totp_enabled AS "totpEnabled"
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      return result.rows[0] || null;
    },

    async findUserAuthById(id) {
      const result = await run(
        `SELECT
          id,
          email,
          full_name AS "fullName",
          password_hash AS "passwordHash",
          role,
          totp_enabled AS "totpEnabled",
          totp_secret AS "totpSecret",
          totp_pending_secret AS "totpPendingSecret"
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      return result.rows[0] || null;
    },

    async createUser({ email, fullName, passwordHash }) {
      const result = await run(
        `INSERT INTO users (email, full_name, password_hash, role)
         VALUES ($1, $2, $3, 'student')
         RETURNING id, email, full_name AS "fullName", role, totp_enabled AS "totpEnabled"`,
        [email, fullName, passwordHash]
      );
      return result.rows[0];
    },

    async updateUserProfile({ userId, fullName }) {
      const result = await run(
        `UPDATE users
         SET full_name = $2
         WHERE id = $1
         RETURNING id, email, full_name AS "fullName", role, totp_enabled AS "totpEnabled"`,
        [userId, fullName]
      );
      return result.rows[0] || null;
    },

    async updateUserPassword({ userId, passwordHash }) {
      const result = await run(
        `UPDATE users
         SET password_hash = $2
         WHERE id = $1
         RETURNING id`,
        [userId, passwordHash]
      );
      return result.rows[0] || null;
    },

    async setTotpPendingSecret({ userId, pendingSecret }) {
      const result = await run(
        `UPDATE users
         SET totp_pending_secret = $2
         WHERE id = $1
         RETURNING id, email, full_name AS "fullName", totp_pending_secret AS "totpPendingSecret", totp_enabled AS "totpEnabled"`,
        [userId, pendingSecret]
      );
      return result.rows[0] || null;
    },

    async enableTotp({ userId, secret }) {
      const result = await run(
        `UPDATE users
         SET totp_enabled = TRUE,
             totp_secret = $2,
             totp_pending_secret = NULL
         WHERE id = $1
         RETURNING id, email, full_name AS "fullName", role, totp_enabled AS "totpEnabled"`,
        [userId, secret]
      );
      return result.rows[0] || null;
    },

    async disableTotp({ userId }) {
      const result = await run(
        `UPDATE users
         SET totp_enabled = FALSE,
             totp_secret = NULL,
             totp_pending_secret = NULL
         WHERE id = $1
         RETURNING id, email, full_name AS "fullName", role, totp_enabled AS "totpEnabled"`,
        [userId]
      );
      return result.rows[0] || null;
    },

    async listUsers({ q = '', limit = 50, offset = 0 } = {}) {
      const values = [];
      let whereSql = '';
      if (q) {
        values.push(`%${q}%`);
        whereSql = `WHERE (u.email ILIKE $1 OR u.full_name ILIKE $1)`;
      }
      values.push(limit, offset);
      const limitParam = values.length - 1;
      const offsetParam = values.length;

      const result = await run(
        `SELECT
          u.id,
          u.email,
          u.full_name AS "fullName",
          u.role,
          u.totp_enabled AS "totpEnabled",
          u.created_at AS "createdAt"
         FROM users u
         ${whereSql}
         ORDER BY u.created_at DESC
         LIMIT $${limitParam}
         OFFSET $${offsetParam}`,
        values
      );
      return result.rows;
    },

    async countUsers({ q = '' } = {}) {
      const values = [];
      let whereSql = '';
      if (q) {
        values.push(`%${q}%`);
        whereSql = `WHERE (email ILIKE $1 OR full_name ILIKE $1)`;
      }
      const result = await run(`SELECT COUNT(*)::int AS total FROM users ${whereSql}`, values);
      return result.rows[0]?.total || 0;
    },

    async adminResetUserPassword({ email, passwordHash }) {
      const result = await run(
        `UPDATE users
         SET password_hash = $2
         WHERE lower(email) = lower($1)
         RETURNING id, email, full_name AS "fullName", role, totp_enabled AS "totpEnabled"`,
        [email, passwordHash]
      );
      return result.rows[0] || null;
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
      const result = await run(
        `INSERT INTO project_actions
          (actor_id, actor_email, actor_role, action_type, entity_type, entity_id, summary, details, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING
          id,
          actor_id AS "actorId",
          actor_email AS "actorEmail",
          actor_role AS "actorRole",
          action_type AS "actionType",
          entity_type AS "entityType",
          entity_id AS "entityId",
          summary,
          details,
          ip_address AS "ipAddress",
          user_agent AS "userAgent",
          created_at AS "createdAt"`,
        [actorId, actorEmail, actorRole, actionType, entityType, entityId, summary, details, ipAddress, userAgent]
      );
      return result.rows[0];
    },

    async listProjectActions(filters) {
      const values = [];
      const where = [];

      if (filters.q) {
        values.push(`%${filters.q}%`);
        const p = values.length;
        where.push(
          `(pa.summary ILIKE $${p} OR COALESCE(pa.actor_email, '') ILIKE $${p} OR COALESCE(u.email, '') ILIKE $${p})`
        );
      }

      if (filters.actionType) {
        values.push(filters.actionType);
        where.push(`pa.action_type = $${values.length}`);
      }

      if (filters.entityType) {
        values.push(filters.entityType);
        where.push(`pa.entity_type = $${values.length}`);
      }

      if (filters.actorId) {
        values.push(filters.actorId);
        where.push(`pa.actor_id = $${values.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      values.push(filters.limit, filters.offset);
      const limitParam = values.length - 1;
      const offsetParam = values.length;

      const result = await run(
        `SELECT
          pa.id,
          pa.action_type AS "actionType",
          pa.entity_type AS "entityType",
          pa.entity_id AS "entityId",
          pa.summary,
          pa.details,
          pa.ip_address AS "ipAddress",
          pa.user_agent AS "userAgent",
          pa.created_at AS "createdAt",
          pa.actor_id AS "actorId",
          COALESCE(u.full_name, '') AS "actorName",
          COALESCE(u.email, pa.actor_email, '') AS "actorEmail",
          COALESCE(pa.actor_role, u.role, '') AS "actorRole"
        FROM project_actions pa
        LEFT JOIN users u ON u.id = pa.actor_id
        ${whereSql}
        ORDER BY pa.created_at DESC
        LIMIT $${limitParam}
        OFFSET $${offsetParam}`,
        values
      );
      return result.rows;
    },

    async countProjectActions(filters) {
      const values = [];
      const where = [];

      if (filters.q) {
        values.push(`%${filters.q}%`);
        const p = values.length;
        where.push(
          `(pa.summary ILIKE $${p} OR COALESCE(pa.actor_email, '') ILIKE $${p} OR COALESCE(u.email, '') ILIKE $${p})`
        );
      }
      if (filters.actionType) {
        values.push(filters.actionType);
        where.push(`pa.action_type = $${values.length}`);
      }
      if (filters.entityType) {
        values.push(filters.entityType);
        where.push(`pa.entity_type = $${values.length}`);
      }
      if (filters.actorId) {
        values.push(filters.actorId);
        where.push(`pa.actor_id = $${values.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const result = await run(
        `SELECT COUNT(*)::int AS total
         FROM project_actions pa
         LEFT JOIN users u ON u.id = pa.actor_id
         ${whereSql}`,
        values
      );
      return result.rows[0]?.total || 0;
    },

    async getAdminSummary() {
      const result = await run(
        `SELECT
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM listings) AS listings,
          (SELECT COUNT(*)::int FROM community_posts) AS "communityPosts",
          (SELECT COUNT(*)::int FROM community_comments) AS "communityComments",
          (SELECT COUNT(*)::int FROM project_actions) AS "actionsTotal",
          (SELECT COUNT(*)::int FROM project_actions WHERE created_at >= NOW() - INTERVAL '24 hours') AS "actionsLast24h"`
      );
      return (
        result.rows[0] || {
          users: 0,
          listings: 0,
          communityPosts: 0,
          communityComments: 0,
          actionsTotal: 0,
          actionsLast24h: 0
        }
      );
    },

    async listListings(filters) {
      const values = [];
      const where = [];
      let distanceSql = 'NULL::double precision';
      const hasCoords = typeof filters.lat === 'number' && typeof filters.lon === 'number';

      if (hasCoords) {
        values.push(filters.lat, filters.lon);
        const latParam = values.length - 1;
        const lonParam = values.length;
        distanceSql = `(6371 * acos(least(1, greatest(-1,
          cos(radians($${latParam})) * cos(radians(l.latitude)) *
          cos(radians(l.longitude) - radians($${lonParam})) +
          sin(radians($${latParam})) * sin(radians(l.latitude))
        ))))`;
      }

      if (filters.q) {
        values.push(`%${filters.q}%`);
        const p = values.length;
        where.push(`(l.title ILIKE $${p} OR l.description ILIKE $${p} OR l.city ILIKE $${p})`);
      }
      if (filters.category) {
        values.push(filters.category);
        where.push(`l.category = $${values.length}`);
      }
      if (filters.listingType) {
        values.push(filters.listingType);
        where.push(`l.listing_type = $${values.length}`);
      }
      if (filters.city) {
        values.push(`%${filters.city}%`);
        where.push(`l.city ILIKE $${values.length}`);
      }
      if (filters.areaCode && filters.areaCode !== 'all') {
        values.push(filters.areaCode);
        where.push(`l.area_code = $${values.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      values.push(filters.limit, filters.offset);
      const limitParam = values.length - 1;
      const offsetParam = values.length;

      let orderSql = 'l.created_at DESC';
      if (filters.sort === 'price_asc') orderSql = 'l.price ASC, l.created_at DESC';
      if (filters.sort === 'price_desc') orderSql = 'l.price DESC, l.created_at DESC';
      if (filters.sort === 'distance' && hasCoords) orderSql = `"distanceKm" ASC NULLS LAST, l.created_at DESC`;

      const result = await run(
        `SELECT
          l.id,
          l.title,
          l.description,
          l.category,
          l.listing_type AS "listingType",
          l.price,
          l.city,
          l.area_code AS "areaCode",
          l.latitude,
          l.longitude,
          l.created_by AS "createdBy",
          l.created_at AS "createdAt",
          u.full_name AS "ownerName",
          ${distanceSql} AS "distanceKm",
          COALESCE(
            json_agg(
              json_build_object(
                'id', m.id,
                'key', m.object_key,
                'url', m.object_url,
                'mediaType', m.media_type
              )
              ORDER BY m.id
            ) FILTER (WHERE m.id IS NOT NULL),
            '[]'::json
          ) AS media
        FROM listings l
        LEFT JOIN users u ON u.id = l.created_by
        LEFT JOIN media_assets m ON m.listing_id = l.id
        ${whereSql}
        GROUP BY l.id, u.full_name
        ORDER BY ${orderSql}
        LIMIT $${limitParam}
        OFFSET $${offsetParam}`,
        values
      );

      return result.rows;
    },

    async countListings(filters) {
      const values = [];
      const where = [];

      if (filters.q) {
        values.push(`%${filters.q}%`);
        const p = values.length;
        where.push(`(title ILIKE $${p} OR description ILIKE $${p} OR city ILIKE $${p})`);
      }
      if (filters.category) {
        values.push(filters.category);
        where.push(`category = $${values.length}`);
      }
      if (filters.listingType) {
        values.push(filters.listingType);
        where.push(`listing_type = $${values.length}`);
      }
      if (filters.city) {
        values.push(`%${filters.city}%`);
        where.push(`city ILIKE $${values.length}`);
      }
      if (filters.areaCode && filters.areaCode !== 'all') {
        values.push(filters.areaCode);
        where.push(`area_code = $${values.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const result = await run(`SELECT COUNT(*)::int AS total FROM listings ${whereSql}`, values);
      return result.rows[0]?.total || 0;
    },

    async createListing({ title, description, category, listingType, price, city, areaCode, latitude, longitude, createdBy }) {
      const result = await run(
        `INSERT INTO listings
          (title, description, category, listing_type, price, city, area_code, latitude, longitude, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING
          id, title, description, category, listing_type AS "listingType", price, city,
          area_code AS "areaCode", latitude, longitude, created_by AS "createdBy", created_at AS "createdAt"`,
        [title, description, category, listingType, price, city, areaCode, latitude, longitude, createdBy]
      );
      return result.rows[0];
    },

    async notifyAllUsersAboutListing({ actorId, listingId, title, city, listingType, category }) {
      const result = await run(
        `INSERT INTO notifications (user_id, kind, title, body, entity_type, entity_id)
         SELECT
           u.id,
           'listing_new',
           $3,
           $4,
           'listing',
           $2
         FROM users u
         WHERE u.id <> $1
         RETURNING id`,
        [actorId, listingId, `New arrival: ${title}`, `${title} • ${city} • ${listingType}/${category}`]
      );
      return result.rowCount || 0;
    },

    async getListingById(id) {
      const result = await run(
        `SELECT
          l.id,
          l.title,
          l.description,
          l.category,
          l.listing_type AS "listingType",
          l.price,
          l.city,
          l.area_code AS "areaCode",
          l.latitude,
          l.longitude,
          l.created_by AS "createdBy",
          l.created_at AS "createdAt",
          u.full_name AS "ownerName",
          u.email AS "ownerEmail",
          COALESCE(
            json_agg(
              json_build_object(
                'id', m.id,
                'key', m.object_key,
                'url', m.object_url,
                'mediaType', m.media_type
              )
              ORDER BY m.id
            ) FILTER (WHERE m.id IS NOT NULL),
            '[]'::json
          ) AS media
        FROM listings l
        LEFT JOIN users u ON u.id = l.created_by
        LEFT JOIN media_assets m ON m.listing_id = l.id
        WHERE l.id = $1
        GROUP BY l.id, u.full_name, u.email`,
        [id]
      );
      return result.rows[0] || null;
    },

    async getListingOwner(listingId) {
      const result = await run(
        `SELECT id, created_by AS "createdBy" FROM listings WHERE id = $1 LIMIT 1`,
        [listingId]
      );
      return result.rows[0] || null;
    },

    async createListingMedia({ listingId, key, url, mediaType }) {
      const result = await run(
        `INSERT INTO media_assets (listing_id, object_key, object_url, media_type)
         VALUES ($1, $2, $3, $4)
         RETURNING id, listing_id AS "listingId", object_key AS "key", object_url AS "url", media_type AS "mediaType", created_at AS "createdAt"`,
        [listingId, key, url, mediaType]
      );
      return result.rows[0];
    },

    async listCommunityCategories() {
      const result = await run(
        `SELECT id, slug, name, description
         FROM community_categories
         ORDER BY name ASC`
      );
      return result.rows;
    },

    async findCommunityCategoryBySlug(slug) {
      const result = await run(
        `SELECT id, slug, name
         FROM community_categories
         WHERE slug = $1
         LIMIT 1`,
        [slug]
      );
      return result.rows[0] || null;
    },

    async listCommunityPosts(filters) {
      const values = [];
      const where = [];
      if (filters.q) {
        values.push(`%${filters.q}%`);
        const p = values.length;
        where.push(`(p.title ILIKE $${p} OR p.content ILIKE $${p})`);
      }
      if (filters.categorySlug) {
        values.push(filters.categorySlug);
        where.push(`c.slug = $${values.length}`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      values.push(filters.limit, filters.offset);
      const limitParam = values.length - 1;
      const offsetParam = values.length;

      const result = await run(
        `SELECT
          p.id,
          p.title,
          p.content,
          p.created_at AS "createdAt",
          p.created_by AS "createdBy",
          c.slug AS "categorySlug",
          c.name AS "categoryName",
          u.full_name AS "authorName",
          COALESCE(cc.comment_count, 0)::int AS "commentCount"
        FROM community_posts p
        INNER JOIN community_categories c ON c.id = p.category_id
        INNER JOIN users u ON u.id = p.created_by
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS comment_count
          FROM community_comments cm
          WHERE cm.post_id = p.id
        ) cc ON true
        ${whereSql}
        ORDER BY p.created_at DESC
        LIMIT $${limitParam}
        OFFSET $${offsetParam}`,
        values
      );
      return result.rows;
    },

    async countCommunityPosts(filters) {
      const values = [];
      const where = [];
      if (filters.q) {
        values.push(`%${filters.q}%`);
        const p = values.length;
        where.push(`(p.title ILIKE $${p} OR p.content ILIKE $${p})`);
      }
      if (filters.categorySlug) {
        values.push(filters.categorySlug);
        where.push(`c.slug = $${values.length}`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const result = await run(
        `SELECT COUNT(*)::int AS total
         FROM community_posts p
         INNER JOIN community_categories c ON c.id = p.category_id
         ${whereSql}`,
        values
      );
      return result.rows[0]?.total || 0;
    },

    async createCommunityPost({ title, content, categoryId, createdBy }) {
      const result = await run(
        `INSERT INTO community_posts (title, content, category_id, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, content, category_id AS "categoryId", created_by AS "createdBy", created_at AS "createdAt"`,
        [title, content, categoryId, createdBy]
      );
      return result.rows[0];
    },

    async getCommunityPostById(postId) {
      const postResult = await run(
        `SELECT
          p.id,
          p.title,
          p.content,
          p.created_at AS "createdAt",
          p.created_by AS "createdBy",
          c.slug AS "categorySlug",
          c.name AS "categoryName",
          u.full_name AS "authorName"
        FROM community_posts p
        INNER JOIN community_categories c ON c.id = p.category_id
        INNER JOIN users u ON u.id = p.created_by
        WHERE p.id = $1
        LIMIT 1`,
        [postId]
      );
      const post = postResult.rows[0];
      if (!post) return null;

      const commentsResult = await run(
        `SELECT
          cm.id,
          cm.comment AS content,
          cm.post_id AS "postId",
          cm.created_by AS "createdBy",
          cm.created_at AS "createdAt",
          u.full_name AS "authorName"
         FROM community_comments cm
         INNER JOIN users u ON u.id = cm.created_by
         WHERE cm.post_id = $1
         ORDER BY cm.created_at ASC`,
        [postId]
      );

      return {
        ...post,
        comments: commentsResult.rows
      };
    },

    async createCommunityComment({ postId, createdBy, content }) {
      const result = await run(
        `INSERT INTO community_comments (post_id, created_by, comment)
         VALUES ($1, $2, $3)
         RETURNING id, post_id AS "postId", created_by AS "createdBy", comment AS content, created_at AS "createdAt"`,
        [postId, createdBy, content]
      );
      return result.rows[0];
    },

    async createUserNotification({ userId, kind, title, body = '', entityType = '', entityId = null }) {
      const result = await run(
        `INSERT INTO notifications (user_id, kind, title, body, entity_type, entity_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING
          id,
          user_id AS "userId",
          kind,
          title,
          body,
          entity_type AS "entityType",
          entity_id AS "entityId",
          is_read AS "isRead",
          created_at AS "createdAt"`,
        [userId, kind, title, body, entityType, entityId]
      );
      return result.rows[0] || null;
    },

    async listNotifications({ userId, unreadOnly = false, limit = 30, offset = 0 }) {
      const values = [userId];
      let whereSql = 'WHERE user_id = $1';
      if (unreadOnly) whereSql += ' AND is_read = FALSE';

      values.push(limit, offset);
      const limitParam = values.length - 1;
      const offsetParam = values.length;

      const result = await run(
        `SELECT
          id,
          user_id AS "userId",
          kind,
          title,
          body,
          entity_type AS "entityType",
          entity_id AS "entityId",
          is_read AS "isRead",
          created_at AS "createdAt"
         FROM notifications
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${limitParam}
         OFFSET $${offsetParam}`,
        values
      );
      return result.rows;
    },

    async countUnreadNotifications({ userId }) {
      const result = await run(
        `SELECT COUNT(*)::int AS total
         FROM notifications
         WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
      );
      return result.rows[0]?.total || 0;
    },

    async markNotificationRead({ userId, notificationId }) {
      const result = await run(
        `UPDATE notifications
         SET is_read = TRUE
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [notificationId, userId]
      );
      return result.rows[0] || null;
    },

    async markAllNotificationsRead({ userId }) {
      const result = await run(
        `UPDATE notifications
         SET is_read = TRUE
         WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
      );
      return result.rowCount || 0;
    },

    async deleteCommunityComment(commentId, userId) {
      const result = await run(
        `DELETE FROM community_comments
         WHERE id = $1 AND created_by = $2
         RETURNING id`,
        [commentId, userId]
      );
      return result.rows[0] || null;
    }
  };
}

module.exports = { createRepository };
