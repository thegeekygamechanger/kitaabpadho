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
          phone_number AS "phoneNumber",
          password_hash AS "passwordHash",
          role,
          push_enabled AS "pushEnabled",
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
          phone_number AS "phoneNumber",
          role,
          push_enabled AS "pushEnabled",
          totp_enabled AS "totpEnabled"
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      return result.rows[0] || null;
    },

    async findUserByFullName(fullName) {
      const result = await run(
        `SELECT
          id,
          email,
          full_name AS "fullName",
          phone_number AS "phoneNumber",
          role,
          push_enabled AS "pushEnabled",
          totp_enabled AS "totpEnabled"
         FROM users
         WHERE lower(full_name) = lower($1)
         LIMIT 1`,
        [fullName]
      );
      return result.rows[0] || null;
    },

    async findUserAuthById(id) {
      const result = await run(
        `SELECT
          id,
          email,
          full_name AS "fullName",
          phone_number AS "phoneNumber",
          password_hash AS "passwordHash",
          role,
          push_enabled AS "pushEnabled",
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

    async createUser({ email, fullName, phoneNumber = '', passwordHash, role = 'student' }) {
      const result = await run(
        `INSERT INTO users (email, full_name, phone_number, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING
          id,
          email,
          full_name AS "fullName",
          phone_number AS "phoneNumber",
          role,
          push_enabled AS "pushEnabled",
          totp_enabled AS "totpEnabled"`,
        [email, fullName, phoneNumber || null, passwordHash, role]
      );
      return result.rows[0];
    },

    async updateUserProfile({ userId, fullName, phoneNumber = '' }) {
      const result = await run(
        `UPDATE users
         SET full_name = $2,
             phone_number = $3
         WHERE id = $1
         RETURNING
          id,
          email,
          full_name AS "fullName",
          phone_number AS "phoneNumber",
          role,
          push_enabled AS "pushEnabled",
          totp_enabled AS "totpEnabled"`,
        [userId, fullName, phoneNumber || null]
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

    async setUserPushEnabled({ userId, enabled }) {
      const result = await run(
        `UPDATE users
         SET push_enabled = $2
         WHERE id = $1
         RETURNING
          id,
          email,
          full_name AS "fullName",
          phone_number AS "phoneNumber",
          role,
          push_enabled AS "pushEnabled",
          totp_enabled AS "totpEnabled"`,
        [userId, Boolean(enabled)]
      );
      return result.rows[0] || null;
    },

    async setTotpPendingSecret({ userId, pendingSecret }) {
      const result = await run(
        `UPDATE users
         SET totp_pending_secret = $2
         WHERE id = $1
         RETURNING
          id,
          email,
          full_name AS "fullName",
          phone_number AS "phoneNumber",
          role,
          push_enabled AS "pushEnabled",
          totp_pending_secret AS "totpPendingSecret",
          totp_enabled AS "totpEnabled"`,
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
         RETURNING
          id,
          email,
          full_name AS "fullName",
          phone_number AS "phoneNumber",
          role,
          push_enabled AS "pushEnabled",
          totp_enabled AS "totpEnabled"`,
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
         RETURNING
          id,
          email,
          full_name AS "fullName",
          phone_number AS "phoneNumber",
          role,
          push_enabled AS "pushEnabled",
          totp_enabled AS "totpEnabled"`,
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
          u.phone_number AS "phoneNumber",
          u.role,
          u.push_enabled AS "pushEnabled",
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
         RETURNING
          id,
          email,
          full_name AS "fullName",
          phone_number AS "phoneNumber",
          role,
          push_enabled AS "pushEnabled",
          totp_enabled AS "totpEnabled"`,
        [email, passwordHash]
      );
      return result.rows[0] || null;
    },

    async getUserPreferences(userId) {
      const result = await run(
        `SELECT
          user_id AS "userId",
          exam_focus AS "examFocus",
          preferred_categories AS "preferredCategories",
          preferred_stationery AS "preferredStationery",
          preferred_radius_km AS "preferredRadiusKm",
          updated_at AS "updatedAt"
         FROM user_preferences
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      return (
        result.rows[0] || {
          userId,
          examFocus: '',
          preferredCategories: [],
          preferredStationery: [],
          preferredRadiusKm: 200
        }
      );
    },

    async upsertUserPreferences({ userId, examFocus = '', preferredCategories = [], preferredStationery = [], preferredRadiusKm = 200 }) {
      const result = await run(
        `INSERT INTO user_preferences
          (user_id, exam_focus, preferred_categories, preferred_stationery, preferred_radius_km, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
          exam_focus = EXCLUDED.exam_focus,
          preferred_categories = EXCLUDED.preferred_categories,
          preferred_stationery = EXCLUDED.preferred_stationery,
          preferred_radius_km = EXCLUDED.preferred_radius_km,
          updated_at = NOW()
         RETURNING
          user_id AS "userId",
          exam_focus AS "examFocus",
          preferred_categories AS "preferredCategories",
          preferred_stationery AS "preferredStationery",
          preferred_radius_km AS "preferredRadiusKm",
          updated_at AS "updatedAt"`,
        [userId, examFocus || null, preferredCategories, preferredStationery, preferredRadiusKm]
      );
      return result.rows[0] || null;
    },

    async addAiChatMemory({ userId, role, message }) {
      const result = await run(
        `INSERT INTO ai_chat_memory (user_id, role, message)
         VALUES ($1, $2, $3)
         RETURNING id, user_id AS "userId", role, message, created_at AS "createdAt"`,
        [userId, role, message]
      );
      return result.rows[0] || null;
    },

    async listRecentAiChatMemory({ userId, limit = 12 }) {
      const result = await run(
        `SELECT role, message, created_at AS "createdAt"
         FROM ai_chat_memory
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows.reverse();
    },

    async listNearbyCities({ lat, lon, radiusKm = 250, limit = 12 }) {
      const result = await run(
        `SELECT
          l.city,
          MIN(
            6371 * acos(least(1, greatest(-1,
              cos(radians($1)) * cos(radians(l.latitude)) *
              cos(radians(l.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(l.latitude))
            )))
          ) AS "distanceKm",
          COUNT(*)::int AS "listingCount"
         FROM listings l
         WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
         GROUP BY l.city
         HAVING MIN(
           6371 * acos(least(1, greatest(-1,
             cos(radians($1)) * cos(radians(l.latitude)) *
             cos(radians(l.longitude) - radians($2)) +
             sin(radians($1)) * sin(radians(l.latitude))
           )))
         ) <= $3
         ORDER BY "distanceKm" ASC
         LIMIT $4`,
        [lat, lon, radiusKm, limit]
      );
      return result.rows;
    },

    async listAreaOptions() {
      const result = await run(
        `SELECT
          area_code AS "areaCode",
          INITCAP(REPLACE(area_code, '_', ' ')) AS "areaName",
          COUNT(*)::int AS "listingCount"
         FROM listings
         WHERE area_code <> ''
         GROUP BY area_code
         ORDER BY "listingCount" DESC`
      );
      return result.rows;
    },

    async listCitySuggestions({ q = '', areaCode = '', limit = 30 } = {}) {
      const normalizedAreaCode = String(areaCode || '').trim();
      const normalizedQuery = String(q || '').trim();
      const queryPattern = normalizedQuery ? `%${normalizedQuery}%` : '';
      const result = await run(
        `WITH filtered AS (
           SELECT
            city,
            COALESCE(serviceable_cities, ARRAY[]::TEXT[]) AS serviceable_cities
           FROM listings l
           WHERE
            ($1 = '' OR l.area_code = $1 OR $1 = ANY(COALESCE(l.serviceable_area_codes, ARRAY[]::TEXT[])))
         ),
         cities AS (
           SELECT DISTINCT TRIM(city) AS city FROM filtered
           UNION
           SELECT DISTINCT TRIM(serviceable_city) AS city
           FROM filtered, UNNEST(serviceable_cities) AS serviceable_city
         )
         SELECT city
         FROM cities
         WHERE city <> ''
           AND ($2 = '' OR city ILIKE $2)
         ORDER BY city ASC
         LIMIT $3`,
        [normalizedAreaCode, queryPattern, limit]
      );
      return result.rows.map((item) => item.city).filter(Boolean);
    },

    async listNearbyStationery({ lat = null, lon = null, city = '', radiusKm = 250, limit = 8 }) {
      const values = [];
      const where = [`(l.category = 'stationery' OR l.category = 'stationary')`];
      let distanceSql = 'NULL::double precision';
      const hasCoords = typeof lat === 'number' && typeof lon === 'number';

      if (hasCoords) {
        values.push(lat, lon);
        const latParam = values.length - 1;
        const lonParam = values.length;
        distanceSql = `(6371 * acos(least(1, greatest(-1,
          cos(radians($${latParam})) * cos(radians(l.latitude)) *
          cos(radians(l.longitude) - radians($${lonParam})) +
          sin(radians($${latParam})) * sin(radians(l.latitude))
        ))))`;
        values.push(radiusKm);
        where.push(`${distanceSql} <= $${values.length}`);
      } else if (city) {
        values.push(`%${city}%`);
        where.push(`l.city ILIKE $${values.length}`);
      }

      values.push(limit);
      const limitParam = values.length;
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const orderSql = hasCoords ? `${distanceSql} ASC, l.created_at DESC` : 'l.created_at DESC';

      const result = await run(
        `SELECT
          l.id,
          l.title,
          l.price,
          l.city,
          l.listing_type AS "listingType",
          l.category,
          ${distanceSql} AS "distanceKm"
         FROM listings l
         ${whereSql}
         ORDER BY ${orderSql}
         LIMIT $${limitParam}`,
        values
      );
      return result.rows;
    },

    async searchListingsForAi({ q = '', lat = null, lon = null, city = '', categories = [], radiusKm = 200, limit = 10 }) {
      const values = [];
      const where = [];
      let distanceSql = 'NULL::double precision';
      const hasCoords = typeof lat === 'number' && typeof lon === 'number';

      if (hasCoords) {
        values.push(lat, lon);
        const latParam = values.length - 1;
        const lonParam = values.length;
        distanceSql = `(6371 * acos(least(1, greatest(-1,
          cos(radians($${latParam})) * cos(radians(l.latitude)) *
          cos(radians(l.longitude) - radians($${lonParam})) +
          sin(radians($${latParam})) * sin(radians(l.latitude))
        ))))`;
        values.push(radiusKm);
        where.push(`l.latitude IS NOT NULL AND l.longitude IS NOT NULL AND ${distanceSql} <= $${values.length}`);
      }

      if (q) {
        values.push(`%${q}%`);
        const p = values.length;
        where.push(`(l.title ILIKE $${p} OR l.description ILIKE $${p} OR l.city ILIKE $${p} OR l.category ILIKE $${p})`);
      }

      if (city) {
        values.push(`%${city}%`);
        where.push(`l.city ILIKE $${values.length}`);
      }

      if (Array.isArray(categories) && categories.length) {
        values.push(categories);
        where.push(`l.category = ANY($${values.length}::text[])`);
      }

      values.push(limit);
      const limitParam = values.length;
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const orderSql = hasCoords ? `${distanceSql} ASC NULLS LAST, l.created_at DESC` : 'l.created_at DESC';

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
          l.created_at AS "createdAt",
          ${distanceSql} AS "distanceKm"
         FROM listings l
         ${whereSql}
         ORDER BY ${orderSql}
         LIMIT $${limitParam}`,
        values
      );
      return result.rows;
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
      const scope = String(filters.scope || 'local').toLowerCase();
      const useGeoLocalScope = scope === 'local' && hasCoords;

      if (useGeoLocalScope) {
        values.push(filters.lat, filters.lon);
        const latParam = values.length - 1;
        const lonParam = values.length;
        distanceSql = `(6371 * acos(least(1, greatest(-1,
          cos(radians($${latParam})) * cos(radians(l.latitude)) *
          cos(radians(l.longitude) - radians($${lonParam})) +
          sin(radians($${latParam})) * sin(radians(l.latitude))
        ))))`;

        if (typeof filters.radiusKm === 'number') {
          values.push(filters.radiusKm);
          where.push(`l.latitude IS NOT NULL AND l.longitude IS NOT NULL AND ${distanceSql} <= $${values.length}`);
        }
      }

      if (scope === 'india') {
        where.push('l.publish_india = TRUE');
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
      if (filters.sellerType) {
        values.push(filters.sellerType);
        where.push(`l.seller_type = $${values.length}`);
      }
      if (filters.city && scope !== 'india') {
        values.push(`%${filters.city}%`);
        const cityParam = values.length;
        where.push(
          `(l.city ILIKE $${cityParam} OR EXISTS (
            SELECT 1
            FROM UNNEST(COALESCE(l.serviceable_cities, ARRAY[]::TEXT[])) AS serviceable_city
            WHERE serviceable_city ILIKE $${cityParam}
          ))`
        );
      }
      if (scope !== 'india' && filters.areaCode && filters.areaCode !== 'all') {
        values.push(filters.areaCode);
        const areaCodeParam = values.length;
        where.push(
          `(l.area_code = $${areaCodeParam} OR $${areaCodeParam} = ANY(COALESCE(l.serviceable_area_codes, ARRAY[]::TEXT[])))`
        );
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      values.push(filters.limit, filters.offset);
      const limitParam = values.length - 1;
      const offsetParam = values.length;

      let orderSql = 'l.created_at DESC';
      if (filters.sort === 'price_asc') orderSql = 'l.price ASC, l.created_at DESC';
      if (filters.sort === 'price_desc') orderSql = 'l.price DESC, l.created_at DESC';
      if (filters.sort === 'distance' && useGeoLocalScope) orderSql = `"distanceKm" ASC NULLS LAST, l.created_at DESC`;

      const result = await run(
        `SELECT
          l.id,
          l.title,
          l.description,
          l.category,
          l.listing_type AS "listingType",
          l.seller_type AS "sellerType",
          l.delivery_mode AS "deliveryMode",
          l.payment_modes AS "paymentModes",
          l.price,
          l.city,
          l.area_code AS "areaCode",
          l.serviceable_area_codes AS "serviceableAreaCodes",
          l.serviceable_cities AS "serviceableCities",
          l.publish_india AS "publishIndia",
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
      let distanceSql = 'NULL::double precision';
      const hasCoords = typeof filters.lat === 'number' && typeof filters.lon === 'number';
      const scope = String(filters.scope || 'local').toLowerCase();
      const useGeoLocalScope = scope === 'local' && hasCoords;

      if (useGeoLocalScope) {
        values.push(filters.lat, filters.lon);
        const latParam = values.length - 1;
        const lonParam = values.length;
        distanceSql = `(6371 * acos(least(1, greatest(-1,
          cos(radians($${latParam})) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($${lonParam})) +
          sin(radians($${latParam})) * sin(radians(latitude))
        ))))`;
        if (typeof filters.radiusKm === 'number') {
          values.push(filters.radiusKm);
          where.push(`latitude IS NOT NULL AND longitude IS NOT NULL AND ${distanceSql} <= $${values.length}`);
        }
      }

      if (scope === 'india') {
        where.push('publish_india = TRUE');
      }

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
      if (filters.sellerType) {
        values.push(filters.sellerType);
        where.push(`seller_type = $${values.length}`);
      }
      if (filters.city && scope !== 'india') {
        values.push(`%${filters.city}%`);
        const cityParam = values.length;
        where.push(
          `(city ILIKE $${cityParam} OR EXISTS (
            SELECT 1
            FROM UNNEST(COALESCE(serviceable_cities, ARRAY[]::TEXT[])) AS serviceable_city
            WHERE serviceable_city ILIKE $${cityParam}
          ))`
        );
      }
      if (scope !== 'india' && filters.areaCode && filters.areaCode !== 'all') {
        values.push(filters.areaCode);
        const areaCodeParam = values.length;
        where.push(
          `(area_code = $${areaCodeParam} OR $${areaCodeParam} = ANY(COALESCE(serviceable_area_codes, ARRAY[]::TEXT[])))`
        );
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const result = await run(`SELECT COUNT(*)::int AS total FROM listings ${whereSql}`, values);
      return result.rows[0]?.total || 0;
    },

    async createListing({
      title,
      description,
      category,
      listingType,
      sellerType = 'student',
      deliveryMode = 'peer_to_peer',
      paymentModes = ['cod'],
      price,
      city,
      areaCode,
      serviceableAreaCodes = [],
      serviceableCities = [],
      publishIndia = false,
      latitude,
      longitude,
      createdBy
    }) {
      const result = await run(
        `INSERT INTO listings
          (title, description, category, listing_type, seller_type, delivery_mode, payment_modes, price, city, area_code, serviceable_area_codes, serviceable_cities, publish_india, latitude, longitude, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING
          id,
          title,
          description,
          category,
          listing_type AS "listingType",
          seller_type AS "sellerType",
          delivery_mode AS "deliveryMode",
          payment_modes AS "paymentModes",
          price,
          city,
          area_code AS "areaCode",
          serviceable_area_codes AS "serviceableAreaCodes",
          serviceable_cities AS "serviceableCities",
          publish_india AS "publishIndia",
          latitude,
          longitude,
          created_by AS "createdBy",
          created_at AS "createdAt"`,
        [
          title,
          description,
          category,
          listingType,
          sellerType,
          deliveryMode,
          paymentModes,
          price,
          city,
          areaCode,
          serviceableAreaCodes,
          serviceableCities,
          Boolean(publishIndia),
          latitude,
          longitude,
          createdBy
        ]
      );
      return result.rows[0];
    },

    async updateListing({
      listingId,
      actorId,
      isAdmin = false,
      title,
      description,
      category,
      listingType,
      sellerType = 'student',
      deliveryMode = 'peer_to_peer',
      paymentModes = ['cod'],
      price,
      city,
      areaCode,
      serviceableAreaCodes = [],
      serviceableCities = [],
      publishIndia = false,
      latitude,
      longitude
    }) {
      const result = await run(
        `UPDATE listings
         SET
          title = $4,
          description = $5,
          category = $6,
          listing_type = $7,
          seller_type = $8,
          delivery_mode = $9,
          payment_modes = $10,
          price = $11,
          city = $12,
          area_code = $13,
          serviceable_area_codes = $14,
          serviceable_cities = $15,
          publish_india = $16,
          latitude = $17,
          longitude = $18
         WHERE id = $1
           AND ($2::boolean OR created_by = $3)
         RETURNING
          id,
          title,
          description,
          category,
          listing_type AS "listingType",
          seller_type AS "sellerType",
          delivery_mode AS "deliveryMode",
          payment_modes AS "paymentModes",
          price,
          city,
          area_code AS "areaCode",
          serviceable_area_codes AS "serviceableAreaCodes",
          serviceable_cities AS "serviceableCities",
          publish_india AS "publishIndia",
          latitude,
          longitude,
          created_by AS "createdBy",
          created_at AS "createdAt"`,
        [
          listingId,
          Boolean(isAdmin),
          actorId,
          title,
          description,
          category,
          listingType,
          sellerType,
          deliveryMode,
          paymentModes,
          price,
          city,
          areaCode,
          serviceableAreaCodes,
          serviceableCities,
          Boolean(publishIndia),
          latitude,
          longitude
        ]
      );
      return result.rows[0] || null;
    },

    async deleteListing({ listingId, actorId, isAdmin = false }) {
      const result = await run(
        `DELETE FROM listings
         WHERE id = $1
           AND ($2::boolean OR created_by = $3)
         RETURNING
          id,
          title,
          category,
          listing_type AS "listingType",
          city,
          created_by AS "createdBy"`,
        [listingId, Boolean(isAdmin), actorId]
      );
      return result.rows[0] || null;
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
        [actorId, listingId, `New arrival: ${title}`, `${title} | ${city} | ${listingType}/${category}`]
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
          l.seller_type AS "sellerType",
          l.delivery_mode AS "deliveryMode",
          l.payment_modes AS "paymentModes",
          l.price,
          l.city,
          l.area_code AS "areaCode",
          l.serviceable_area_codes AS "serviceableAreaCodes",
          l.serviceable_cities AS "serviceableCities",
          l.publish_india AS "publishIndia",
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

    async getCommunityCommentById(commentId) {
      const result = await run(
        `SELECT
          cm.id,
          cm.post_id AS "postId",
          cm.created_by AS "createdBy",
          cm.comment AS content,
          cm.created_at AS "createdAt",
          u.full_name AS "authorName"
         FROM community_comments cm
         INNER JOIN users u ON u.id = cm.created_by
         WHERE cm.id = $1
         LIMIT 1`,
        [commentId]
      );
      return result.rows[0] || null;
    },

    async updateCommunityComment({ commentId, actorId, isAdmin = false, content }) {
      const result = await run(
        `UPDATE community_comments
         SET comment = $4
         WHERE id = $1
           AND ($2::boolean OR created_by = $3)
         RETURNING
          id,
          post_id AS "postId",
          created_by AS "createdBy",
          comment AS content,
          created_at AS "createdAt"`,
        [commentId, Boolean(isAdmin), actorId, content]
      );
      return result.rows[0] || null;
    },

    async updateCommunityPost({ postId, actorId, isAdmin = false, title, content, categoryId }) {
      const result = await run(
        `UPDATE community_posts
         SET
          title = $4,
          content = $5,
          category_id = $6
         WHERE id = $1
           AND ($2::boolean OR created_by = $3)
         RETURNING
          id,
          title,
          content,
          category_id AS "categoryId",
          created_by AS "createdBy",
          created_at AS "createdAt"`,
        [postId, Boolean(isAdmin), actorId, title, content, categoryId]
      );
      return result.rows[0] || null;
    },

    async deleteCommunityPost({ postId, actorId, isAdmin = false }) {
      const result = await run(
        `DELETE FROM community_posts
         WHERE id = $1
           AND ($2::boolean OR created_by = $3)
         RETURNING
          id,
          title,
          created_by AS "createdBy"`,
        [postId, Boolean(isAdmin), actorId]
      );
      return result.rows[0] || null;
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

    async upsertPushSubscription({ userId, endpoint, p256dh, auth, city = '', areaCode = '', latitude = null, longitude = null }) {
      const result = await run(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, city, area_code, latitude, longitude, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (endpoint) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          city = EXCLUDED.city,
          area_code = EXCLUDED.area_code,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          updated_at = NOW()
         RETURNING
          id,
          user_id AS "userId",
          endpoint,
          p256dh,
          auth,
          city,
          area_code AS "areaCode",
          latitude,
          longitude,
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
        [userId, endpoint, p256dh, auth, city || '', areaCode || '', latitude, longitude]
      );
      return result.rows[0] || null;
    },

    async deletePushSubscription({ userId, endpoint }) {
      const result = await run(
        `DELETE FROM push_subscriptions
         WHERE user_id = $1 AND endpoint = $2
         RETURNING id`,
        [userId, endpoint]
      );
      return result.rows[0] || null;
    },

    async listPushSubscriptionsByUser({ userId }) {
      const result = await run(
        `SELECT endpoint, p256dh, auth
         FROM push_subscriptions
         WHERE user_id = $1`,
        [userId]
      );
      return result.rows.map((item) => ({
        endpoint: item.endpoint,
        keys: {
          p256dh: item.p256dh,
          auth: item.auth
        }
      }));
    },

    async listPushSubscriptionsNear({ lat = null, lon = null, radiusKm = 250, city = '' } = {}) {
      const hasCoords = typeof lat === 'number' && typeof lon === 'number';
      if (hasCoords) {
        const result = await run(
          `SELECT
            ps.endpoint,
            ps.p256dh,
            ps.auth,
            (6371 * acos(least(1, greatest(-1,
              cos(radians($1)) * cos(radians(ps.latitude)) *
              cos(radians(ps.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(ps.latitude))
            )))) AS "distanceKm"
           FROM push_subscriptions ps
           INNER JOIN users u ON u.id = ps.user_id
           WHERE u.push_enabled = TRUE
             AND ps.latitude IS NOT NULL
             AND ps.longitude IS NOT NULL
             AND (6371 * acos(least(1, greatest(-1,
               cos(radians($1)) * cos(radians(ps.latitude)) *
               cos(radians(ps.longitude) - radians($2)) +
               sin(radians($1)) * sin(radians(ps.latitude))
             )))) <= $3
           ORDER BY "distanceKm" ASC`,
          [lat, lon, radiusKm]
        );
        return result.rows.map((item) => ({
          endpoint: item.endpoint,
          keys: { p256dh: item.p256dh, auth: item.auth }
        }));
      }

      const values = [];
      let whereSql = '';
      if (city) {
        values.push(`%${city}%`);
        whereSql = `AND ps.city ILIKE $1`;
      }
      const result = await run(
        `SELECT ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscriptions ps
         INNER JOIN users u ON u.id = ps.user_id
         WHERE u.push_enabled = TRUE
         ${whereSql}`,
        values
      );
      return result.rows.map((item) => ({
        endpoint: item.endpoint,
        keys: { p256dh: item.p256dh, auth: item.auth }
      }));
    },

    async createFeedback({
      userId = null,
      sourcePortal = 'client',
      senderName,
      senderEmail,
      senderRole = 'guest',
      subject,
      message,
      attachmentKey = ''
    }) {
      const result = await run(
        `INSERT INTO customer_feedback
          (user_id, source_portal, sender_name, sender_email, sender_role, subject, message, attachment_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING
          id,
          user_id AS "userId",
          source_portal AS "sourcePortal",
          sender_name AS "senderName",
          sender_email AS "senderEmail",
          sender_role AS "senderRole",
          subject,
          message,
          attachment_key AS "attachmentKey",
          created_at AS "createdAt"`,
        [userId, sourcePortal, senderName, senderEmail, senderRole, subject, message, attachmentKey]
      );
      return result.rows[0] || null;
    },

    async listFeedbackForUser({ userId, limit = 20, offset = 0 }) {
      const result = await run(
        `SELECT
          id,
          user_id AS "userId",
          source_portal AS "sourcePortal",
          sender_name AS "senderName",
          sender_email AS "senderEmail",
          sender_role AS "senderRole",
          subject,
          message,
          attachment_key AS "attachmentKey",
          created_at AS "createdAt"
         FROM customer_feedback
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2
         OFFSET $3`,
        [userId, limit, offset]
      );
      return result.rows;
    },

    async listFeedback({ limit = 50, offset = 0 }) {
      const result = await run(
        `SELECT
          id,
          user_id AS "userId",
          source_portal AS "sourcePortal",
          sender_name AS "senderName",
          sender_email AS "senderEmail",
          sender_role AS "senderRole",
          subject,
          message,
          attachment_key AS "attachmentKey",
          created_at AS "createdAt"
         FROM customer_feedback
         ORDER BY created_at DESC
         LIMIT $1
         OFFSET $2`,
        [limit, offset]
      );
      return result.rows;
    },

    async listPublicBanners({ scope = 'local', limit = 10 } = {}) {
      const normalizedScope = String(scope || 'local').toLowerCase();
      let scopeWhere = '(b.scope = \'local\' OR b.scope = \'all\')';
      if (normalizedScope === 'india') scopeWhere = '(b.scope = \'india\' OR b.scope = \'all\')';
      if (normalizedScope === 'all') scopeWhere = 'TRUE';

      const result = await run(
        `SELECT
          b.id,
          b.title,
          b.message,
          b.image_key AS "imageKey",
          b.image_url AS "imageUrl",
          b.link_url AS "linkUrl",
          b.button_text AS "buttonText",
          b.scope,
          b.is_active AS "isActive",
          b.priority,
          b.source,
          b.listing_id AS "listingId",
          b.created_by AS "createdBy",
          b.created_by_role AS "createdByRole",
          b.created_at AS "createdAt",
          b.updated_at AS "updatedAt"
         FROM marketing_banners b
         WHERE b.is_active = TRUE
           AND ${scopeWhere}
         ORDER BY b.priority DESC, b.updated_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    },

    async listBannersByActor({ actorId = null, isAdmin = false, limit = 50 } = {}) {
      const values = [];
      const where = [];
      if (!isAdmin) {
        values.push(actorId);
        where.push(`b.created_by = $${values.length}`);
      }
      values.push(limit);
      const limitParam = values.length;
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const result = await run(
        `SELECT
          b.id,
          b.title,
          b.message,
          b.image_key AS "imageKey",
          b.image_url AS "imageUrl",
          b.link_url AS "linkUrl",
          b.button_text AS "buttonText",
          b.scope,
          b.is_active AS "isActive",
          b.priority,
          b.source,
          b.listing_id AS "listingId",
          b.created_by AS "createdBy",
          b.created_by_role AS "createdByRole",
          b.created_at AS "createdAt",
          b.updated_at AS "updatedAt"
         FROM marketing_banners b
         ${whereSql}
         ORDER BY b.updated_at DESC
         LIMIT $${limitParam}`,
        values
      );
      return result.rows;
    },

    async getBannerById(id) {
      const result = await run(
        `SELECT
          b.id,
          b.title,
          b.message,
          b.image_key AS "imageKey",
          b.image_url AS "imageUrl",
          b.link_url AS "linkUrl",
          b.button_text AS "buttonText",
          b.scope,
          b.is_active AS "isActive",
          b.priority,
          b.source,
          b.listing_id AS "listingId",
          b.created_by AS "createdBy",
          b.created_by_role AS "createdByRole",
          b.created_at AS "createdAt",
          b.updated_at AS "updatedAt"
         FROM marketing_banners b
         WHERE b.id = $1
         LIMIT 1`,
        [id]
      );
      return result.rows[0] || null;
    },

    async createBanner({
      title,
      message = '',
      imageKey = '',
      imageUrl = '',
      linkUrl = '/#marketplace',
      buttonText = 'View',
      scope = 'local',
      isActive = true,
      priority = 0,
      source = 'manual',
      listingId = null,
      createdBy = null,
      createdByRole = 'seller'
    }) {
      const result = await run(
        `INSERT INTO marketing_banners
          (title, message, image_key, image_url, link_url, button_text, scope, is_active, priority, source, listing_id, created_by, created_by_role, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
         RETURNING
          id,
          title,
          message,
          image_key AS "imageKey",
          image_url AS "imageUrl",
          link_url AS "linkUrl",
          button_text AS "buttonText",
          scope,
          is_active AS "isActive",
          priority,
          source,
          listing_id AS "listingId",
          created_by AS "createdBy",
          created_by_role AS "createdByRole",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
        [
          title,
          message || '',
          imageKey || '',
          imageUrl || '',
          linkUrl || '/#marketplace',
          buttonText || 'View',
          scope || 'local',
          Boolean(isActive),
          Number(priority || 0),
          source || 'manual',
          listingId,
          createdBy,
          createdByRole || 'seller'
        ]
      );
      return result.rows[0] || null;
    },

    async updateBanner({ bannerId, actorId, isAdmin = false, patch = {} }) {
      const allowedMap = {
        title: 'title',
        message: 'message',
        imageKey: 'image_key',
        imageUrl: 'image_url',
        linkUrl: 'link_url',
        buttonText: 'button_text',
        scope: 'scope',
        isActive: 'is_active',
        priority: 'priority'
      };
      const values = [bannerId, Boolean(isAdmin), actorId];
      const sets = [];
      for (const [key, column] of Object.entries(allowedMap)) {
        if (!(key in patch)) continue;
        values.push(patch[key]);
        sets.push(`${column} = $${values.length}`);
      }
      if (sets.length === 0) return null;
      sets.push('updated_at = NOW()');

      const result = await run(
        `UPDATE marketing_banners
         SET ${sets.join(', ')}
         WHERE id = $1
           AND ($2::boolean OR created_by = $3)
         RETURNING
          id,
          title,
          message,
          image_key AS "imageKey",
          image_url AS "imageUrl",
          link_url AS "linkUrl",
          button_text AS "buttonText",
          scope,
          is_active AS "isActive",
          priority,
          source,
          listing_id AS "listingId",
          created_by AS "createdBy",
          created_by_role AS "createdByRole",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
        values
      );
      return result.rows[0] || null;
    },

    async deleteBanner({ bannerId, actorId, isAdmin = false }) {
      const result = await run(
        `DELETE FROM marketing_banners
         WHERE id = $1
           AND ($2::boolean OR created_by = $3)
         RETURNING id, title, source, listing_id AS "listingId", created_by AS "createdBy"`,
        [bannerId, Boolean(isAdmin), actorId]
      );
      return result.rows[0] || null;
    },

    async upsertAutoBannerForListing({
      listingId,
      title,
      city,
      listingType,
      imageKey = '',
      imageUrl = '',
      publishIndia = false,
      createdBy = null,
      createdByRole = 'seller'
    }) {
      const scope = publishIndia ? 'all' : 'local';
      const linkUrl = '/#marketplace';
      const message = `${title} is now live in ${city} (${listingType}).`;
      const existing = await run(
        `SELECT id
         FROM marketing_banners
         WHERE listing_id = $1 AND source = 'listing_auto'
         LIMIT 1`,
        [listingId]
      );

      if (existing.rows[0]?.id) {
        const updated = await run(
          `UPDATE marketing_banners
           SET
            title = $2,
            message = $3,
            image_key = CASE WHEN $4 = '' THEN image_key ELSE $4 END,
            image_url = CASE WHEN $5 = '' THEN image_url ELSE $5 END,
            link_url = $6,
            button_text = 'Open',
            scope = $7,
            is_active = TRUE,
            priority = GREATEST(priority, 20),
            updated_at = NOW()
           WHERE id = $1
           RETURNING id`,
          [existing.rows[0].id, title, message, imageKey || '', imageUrl || '', linkUrl, scope]
        );
        return updated.rows[0] || null;
      }

      const inserted = await run(
        `INSERT INTO marketing_banners
          (title, message, image_key, image_url, link_url, button_text, scope, is_active, priority, source, listing_id, created_by, created_by_role, updated_at)
         VALUES ($1,$2,$3,$4,$5,'Open',$6,TRUE,20,'listing_auto',$7,$8,$9,NOW())
         RETURNING id`,
        [title, message, imageKey || '', imageUrl || '', linkUrl, scope, listingId, createdBy, createdByRole]
      );
      return inserted.rows[0] || null;
    },

    async createDeliveryJob({ listingId, pickupCity, pickupAreaCode = '', pickupLatitude = null, pickupLongitude = null, deliveryMode, createdBy }) {
      const result = await run(
        `INSERT INTO delivery_jobs
          (listing_id, pickup_city, pickup_area_code, pickup_latitude, pickup_longitude, delivery_mode, created_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'open')
         RETURNING
          id,
          listing_id AS "listingId",
          pickup_city AS "pickupCity",
          pickup_area_code AS "pickupAreaCode",
          pickup_latitude AS "pickupLatitude",
          pickup_longitude AS "pickupLongitude",
          delivery_mode AS "deliveryMode",
          status,
          created_by AS "createdBy",
          claimed_by AS "claimedBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
        [listingId, pickupCity, pickupAreaCode, pickupLatitude, pickupLongitude, deliveryMode, createdBy]
      );
      return result.rows[0] || null;
    },

    async listDeliveryJobs({ lat = null, lon = null, radiusKm = 250, city = '', areaCode = '', status = 'open', limit = 25, offset = 0 }) {
      const values = [];
      const where = [];
      let distanceSql = 'NULL::double precision';
      const hasCoords = typeof lat === 'number' && typeof lon === 'number';

      if (status) {
        values.push(status);
        where.push(`dj.status = $${values.length}`);
      }
      if (city) {
        values.push(`%${city}%`);
        where.push(`dj.pickup_city ILIKE $${values.length}`);
      }
      if (areaCode) {
        values.push(areaCode);
        where.push(`dj.pickup_area_code = $${values.length}`);
      }
      if (hasCoords) {
        values.push(lat, lon);
        const latParam = values.length - 1;
        const lonParam = values.length;
        distanceSql = `(6371 * acos(least(1, greatest(-1,
          cos(radians($${latParam})) * cos(radians(dj.pickup_latitude)) *
          cos(radians(dj.pickup_longitude) - radians($${lonParam})) +
          sin(radians($${latParam})) * sin(radians(dj.pickup_latitude))
        ))))`;
        values.push(radiusKm);
        where.push(`dj.pickup_latitude IS NOT NULL AND dj.pickup_longitude IS NOT NULL AND ${distanceSql} <= $${values.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      values.push(limit, offset);
      const limitParam = values.length - 1;
      const offsetParam = values.length;
      const orderSql = hasCoords ? `${distanceSql} ASC NULLS LAST, dj.created_at DESC` : 'dj.created_at DESC';

      const result = await run(
        `SELECT
          dj.id,
          dj.listing_id AS "listingId",
          dj.pickup_city AS "pickupCity",
          dj.pickup_area_code AS "pickupAreaCode",
          dj.pickup_latitude AS "pickupLatitude",
          dj.pickup_longitude AS "pickupLongitude",
          dj.delivery_mode AS "deliveryMode",
          dj.status,
          dj.created_by AS "createdBy",
          dj.claimed_by AS "claimedBy",
          dj.created_at AS "createdAt",
          dj.updated_at AS "updatedAt",
          l.title AS "listingTitle",
          l.price AS "listingPrice",
          l.listing_type AS "listingType",
          l.seller_type AS "sellerType",
          ${distanceSql} AS "distanceKm"
         FROM delivery_jobs dj
         INNER JOIN listings l ON l.id = dj.listing_id
         ${whereSql}
         ORDER BY ${orderSql}
         LIMIT $${limitParam}
         OFFSET $${offsetParam}`,
        values
      );
      return result.rows;
    },

    async claimDeliveryJob({ jobId, userId }) {
      const result = await run(
        `UPDATE delivery_jobs
         SET status = 'claimed',
             claimed_by = $2,
             updated_at = NOW()
         WHERE id = $1 AND status = 'open'
         RETURNING
          id,
          listing_id AS "listingId",
          pickup_city AS "pickupCity",
          pickup_area_code AS "pickupAreaCode",
          pickup_latitude AS "pickupLatitude",
          pickup_longitude AS "pickupLongitude",
          delivery_mode AS "deliveryMode",
          status,
          created_by AS "createdBy",
          claimed_by AS "claimedBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
        [jobId, userId]
      );
      return result.rows[0] || null;
    },

    async getDeliveryJobById(jobId) {
      const result = await run(
        `SELECT
          dj.id,
          dj.listing_id AS "listingId",
          dj.pickup_city AS "pickupCity",
          dj.pickup_area_code AS "pickupAreaCode",
          dj.pickup_latitude AS "pickupLatitude",
          dj.pickup_longitude AS "pickupLongitude",
          dj.delivery_mode AS "deliveryMode",
          dj.status,
          dj.created_by AS "createdBy",
          dj.claimed_by AS "claimedBy",
          dj.created_at AS "createdAt",
          dj.updated_at AS "updatedAt"
         FROM delivery_jobs dj
         WHERE dj.id = $1
         LIMIT 1`,
        [jobId]
      );
      return result.rows[0] || null;
    },

    async updateDeliveryJobStatus({ jobId, actorId, isAdmin = false, status }) {
      const result = await run(
        `UPDATE delivery_jobs
         SET
          status = $4,
          claimed_by = CASE
            WHEN $4 = 'open' THEN NULL
            WHEN $4 = 'claimed' AND claimed_by IS NULL THEN $3
            ELSE claimed_by
          END,
          updated_at = NOW()
         WHERE id = $1
           AND ($2::boolean OR created_by = $3 OR claimed_by = $3)
         RETURNING
          id,
          listing_id AS "listingId",
          pickup_city AS "pickupCity",
          pickup_area_code AS "pickupAreaCode",
          pickup_latitude AS "pickupLatitude",
          pickup_longitude AS "pickupLongitude",
          delivery_mode AS "deliveryMode",
          status,
          created_by AS "createdBy",
          claimed_by AS "claimedBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
        [jobId, Boolean(isAdmin), actorId, status]
      );
      return result.rows[0] || null;
    },

    async deleteDeliveryJob({ jobId, actorId, isAdmin = false }) {
      const result = await run(
        `DELETE FROM delivery_jobs
         WHERE id = $1
           AND ($2::boolean OR created_by = $3 OR claimed_by = $3)
         RETURNING
          id,
          listing_id AS "listingId",
          created_by AS "createdBy"`,
        [jobId, Boolean(isAdmin), actorId]
      );
      return result.rows[0] || null;
    },

    async deleteCommunityComment(commentId, userId, isAdmin = false) {
      const result = await run(
        `DELETE FROM community_comments
         WHERE id = $1 AND ($3::boolean OR created_by = $2)
         RETURNING id, post_id AS "postId", created_by AS "createdBy"`,
        [commentId, userId, Boolean(isAdmin)]
      );
      return result.rows[0] || null;
    }
  };
}

module.exports = { createRepository };
