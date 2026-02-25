const { z } = require('zod');

const categories = ['book', 'instrument', 'notes', 'video', 'pdf', 'stationery', 'stationary'];
const listingTypes = ['rent', 'buy', 'sell'];
const areaCodes = ['all'];
const accountRoles = ['student', 'seller', 'delivery'];
const adminAccountRoles = ['student', 'seller', 'delivery', 'admin'];
const sellerTypes = ['student', 'library', 'reseller', 'wholesaler', 'college', 'individual_seller', 'shop'];
const deliveryModes = ['peer_to_peer', 'seller_dedicated', 'kpi_dedicated'];
const paymentModes = ['cod'];
const orderStatuses = ['received', 'packing', 'shipping', 'out_for_delivery', 'delivered', 'cancelled'];
const listingScopes = ['local', 'india', 'all'];
const bannerScopes = ['local', 'india', 'all'];

const categoryEnum = z.enum(categories);
const listingTypeEnum = z.enum(listingTypes);
const accountRoleEnum = z.enum(accountRoles);
const adminAccountRoleEnum = z.enum(adminAccountRoles);
const sellerTypeEnum = z.enum(sellerTypes);
const deliveryModeEnum = z.enum(deliveryModes);
const paymentModeEnum = z.enum(paymentModes);
const orderStatusEnum = z.enum(orderStatuses);
const listingScopeEnum = z.enum(listingScopes);
const bannerScopeEnum = z.enum(bannerScopes);
const areaCodeSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9_-]+$/);

const optionalNumber = (schema) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const asNumber = Number(value);
    return Number.isNaN(asNumber) ? value : asNumber;
  }, schema.optional());

const listingSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(1500),
  category: categoryEnum,
  listingType: listingTypeEnum,
  sellerType: sellerTypeEnum.optional().default('student'),
  deliveryMode: deliveryModeEnum.optional().default('peer_to_peer'),
  deliveryRatePer10Km: z.number().min(0).max(500).optional(),
  paymentModes: z.array(paymentModeEnum).min(1).max(1).optional().default(['cod']),
  price: z.number().min(0),
  totalItems: z.number().int().min(1).max(100000).optional(),
  remainingItems: z.number().int().min(0).max(100000).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().trim().min(2).max(100).optional().default('Unknown'),
  areaCode: areaCodeSchema.optional().default('unknown'),
  serviceableAreaCodes: z.array(areaCodeSchema).max(20).optional().default([]),
  serviceableCities: z.array(z.string().trim().min(2).max(100)).max(30).optional().default([]),
  publishIndia: z.boolean().optional().default(false)
});
const listingUpdateSchema = listingSchema;

const listingQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: categoryEnum.optional(),
  listingType: listingTypeEnum.optional(),
  sellerType: sellerTypeEnum.optional(),
  city: z.string().trim().min(1).max(100).optional(),
  areaCode: z.union([areaCodeSchema, z.literal('all')]).optional(),
  scope: listingScopeEnum.optional().default('local'),
  lat: optionalNumber(z.number().min(-90).max(90)),
  lon: optionalNumber(z.number().min(-180).max(180)),
  radiusKm: optionalNumber(z.number().min(1).max(500)),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'distance']).optional().default('newest'),
  limit: optionalNumber(z.number().int().min(1).max(100)).default(24),
  offset: optionalNumber(z.number().int().min(0).max(10000)).default(0)
});

const totpCodeSchema = z.string().trim().regex(/^\d{6}$/);

const authRegisterSchema = z
  .object({
    email: z.string().trim().email().max(180),
    fullName: z.string().trim().min(2).max(120),
    phoneNumber: z.string().trim().regex(/^[0-9]{10,15}$/),
    password: z.string().min(8).max(128),
    role: accountRoleEnum.optional().default('student'),
    totpSecret: z.string().trim().toUpperCase().regex(/^[A-Z2-7]{16,}$/).optional(),
    totpCode: totpCodeSchema.optional()
  })
  .refine((value) => (value.totpSecret && value.totpCode) || (!value.totpSecret && !value.totpCode), {
    message: 'Provide both totpSecret and totpCode or leave both empty',
    path: ['totpSecret']
  });

const authLoginSchema = z
  .object({
    email: z.string().trim().email().max(180),
    password: z.string().min(8).max(128).optional(),
    totpCode: totpCodeSchema.optional()
  })
  .refine((value) => Boolean(value.password || value.totpCode), {
    message: 'Provide password or totpCode',
    path: ['password']
  });

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phoneNumber: z.string().trim().regex(/^[0-9]{10,15}$/)
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(128).optional(),
    newPassword: z.string().min(8).max(128),
    totpCode: totpCodeSchema.optional()
  })
  .refine((value) => Boolean(value.currentPassword || value.totpCode), {
    message: 'Provide currentPassword or totpCode',
    path: ['currentPassword']
  });

const totpEnableSchema = z.object({
  code: totpCodeSchema
});

const notificationsQuerySchema = z.object({
  unreadOnly: z.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean()).optional().default(false),
  limit: optionalNumber(z.number().int().min(1).max(100)).default(30),
  offset: optionalNumber(z.number().int().min(0).max(10000)).default(0)
});

const adminUsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(160).optional(),
  limit: optionalNumber(z.number().int().min(1).max(100)).default(50),
  offset: optionalNumber(z.number().int().min(0).max(10000)).default(0)
});

const adminUserCreateSchema = z.object({
  email: z.string().trim().email().max(180),
  fullName: z.string().trim().min(2).max(120),
  phoneNumber: z.string().trim().regex(/^[0-9]{10,15}$/),
  password: z.string().min(8).max(128),
  role: adminAccountRoleEnum.optional().default('student')
});

const adminUserUpdateSchema = z
  .object({
    email: z.string().trim().email().max(180).optional(),
    fullName: z.string().trim().min(2).max(120).optional(),
    phoneNumber: z.string().trim().regex(/^[0-9]{10,15}$/).optional(),
    role: adminAccountRoleEnum.optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required',
    path: ['email']
  });

const adminResetUserPasswordSchema = z.object({
  email: z.string().trim().email().max(180),
  newPassword: z.string().min(8).max(128)
});

const adminChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128)
});

const communityPostSchema = z.object({
  title: z.string().trim().min(5).max(160),
  content: z.string().trim().min(10).max(4000),
  categorySlug: z.string().trim().min(2).max(64).regex(/^[a-z0-9-]+$/)
});
const communityPostUpdateSchema = communityPostSchema;

const communityCommentSchema = z.object({
  content: z.string().trim().min(1).max(1000)
});
const communityCommentUpdateSchema = communityCommentSchema;

const communityListQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  categorySlug: z.string().trim().min(2).max(64).regex(/^[a-z0-9-]+$/).optional(),
  limit: optionalNumber(z.number().int().min(1).max(50)).default(20),
  offset: optionalNumber(z.number().int().min(0).max(5000)).default(0)
});

const actionTokenSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9_.:-]+$/);

const adminActionQuerySchema = z.object({
  q: z.string().trim().min(1).max(160).optional(),
  actionType: actionTokenSchema.optional(),
  entityType: actionTokenSchema.optional(),
  actorId: optionalNumber(z.number().int().positive()),
  limit: optionalNumber(z.number().int().min(1).max(100)).default(50),
  offset: optionalNumber(z.number().int().min(0).max(10000)).default(0)
});

const aiSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  lat: optionalNumber(z.number().min(-90).max(90)),
  lon: optionalNumber(z.number().min(-180).max(180)),
  city: z.string().trim().min(1).max(100).optional(),
  areaCode: z.string().trim().min(1).max(120).optional(),
  radiusKm: optionalNumber(z.number().min(1).max(500))
});

const totpSignupSetupSchema = z.object({
  email: z.string().trim().email().max(180),
  fullName: z.string().trim().min(2).max(120)
});

const pushToggleSchema = z.object({
  enabled: z.boolean()
});

const pushSubscribeSchema = z.object({
  city: z.string().trim().max(120).optional(),
  areaCode: z.string().trim().max(120).optional(),
  lat: optionalNumber(z.number().min(-90).max(90)),
  lon: optionalNumber(z.number().min(-180).max(180)),
  subscription: z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({
      p256dh: z.string().min(16).max(512),
      auth: z.string().min(8).max(512)
    })
  })
});

const deliveryJobsQuerySchema = z.object({
  lat: optionalNumber(z.number().min(-90).max(90)),
  lon: optionalNumber(z.number().min(-180).max(180)),
  radiusKm: optionalNumber(z.number().min(1).max(500)).default(250),
  city: z.string().trim().min(1).max(120).optional(),
  areaCode: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['open', 'claimed', 'picked', 'on_the_way', 'delivered', 'rejected', 'completed', 'cancelled']).optional().default('open'),
  limit: optionalNumber(z.number().int().min(1).max(100)).default(25),
  offset: optionalNumber(z.number().int().min(0).max(10000)).default(0)
});

const feedbackCreateSchema = z.object({
  sourcePortal: z.enum(['client', 'seller', 'delivery', 'admin']).optional().default('client'),
  senderName: z.string().trim().min(2).max(120).optional(),
  senderEmail: z.string().trim().email().max(180).optional(),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(8).max(3000)
});

const feedbackListQuerySchema = z.object({
  limit: optionalNumber(z.number().int().min(1).max(100)).default(20),
  offset: optionalNumber(z.number().int().min(0).max(10000)).default(0)
});

const bannerQuerySchema = z.object({
  scope: bannerScopeEnum.optional().default('local'),
  limit: optionalNumber(z.number().int().min(1).max(30)).default(10)
});

const bannerSchema = z.object({
  title: z.string().trim().min(3).max(160),
  message: z.string().trim().min(3).max(500).optional().default(''),
  imageKey: z.string().trim().max(500).optional().default(''),
  imageUrl: z.string().trim().url().max(2000).optional().default(''),
  linkUrl: z.string().trim().min(1).max(2000).optional().default('/#marketplace'),
  buttonText: z.string().trim().min(1).max(40).optional().default('View'),
  scope: bannerScopeEnum.optional().default('local'),
  isActive: z.boolean().optional().default(true),
  priority: z.number().int().min(-100).max(100).optional().default(0),
  listingId: optionalNumber(z.number().int().positive())
});

const bannerUpdateSchema = bannerSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'At least one field is required',
  path: ['title']
});

const locationGeocodeSchema = z.object({
  q: z.string().trim().min(2).max(180)
});

const deliveryJobStatusSchema = z.object({
  status: z.enum(['open', 'claimed', 'picked', 'on_the_way', 'delivered', 'rejected', 'completed', 'cancelled']),
  note: z.string().trim().max(500).optional().default('')
});

const marketplaceOrderCreateSchema = z.object({
  listingId: z.preprocess(
    (value) => {
      const asNumber = Number(value);
      return Number.isNaN(asNumber) ? value : asNumber;
    },
    z.number().int().positive()
  ),
  action: z.enum(['buy', 'rent']).optional(),
  quantity: optionalNumber(z.number().int().min(1).max(20)).default(1),
  paymentMode: paymentModeEnum.optional(),
  buyerLat: optionalNumber(z.number().min(-90).max(90)),
  buyerLon: optionalNumber(z.number().min(-180).max(180)),
  buyerCity: z.string().trim().min(2).max(120).optional(),
  buyerAreaCode: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(500).optional().default('')
});

const marketplaceOrdersQuerySchema = z.object({
  status: orderStatusEnum.optional(),
  limit: optionalNumber(z.number().int().min(1).max(100)).default(30),
  offset: optionalNumber(z.number().int().min(0).max(10000)).default(0)
});

const marketplaceOrderStatusSchema = z.object({
  status: orderStatusEnum,
  tag: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional()
});

const marketplaceOrderNoteSchema = z.object({
  message: z.string().trim().min(1).max(500)
});

module.exports = {
  categories,
  listingTypes,
  areaCodes,
  accountRoles,
  adminAccountRoles,
  sellerTypes,
  deliveryModes,
  paymentModes,
  orderStatuses,
  listingScopes,
  bannerScopes,
  listingSchema,
  listingUpdateSchema,
  listingQuerySchema,
  authRegisterSchema,
  authLoginSchema,
  profileUpdateSchema,
  changePasswordSchema,
  totpEnableSchema,
  communityPostSchema,
  communityPostUpdateSchema,
  communityCommentSchema,
  communityCommentUpdateSchema,
  communityListQuerySchema,
  notificationsQuerySchema,
  adminActionQuerySchema,
  adminUsersQuerySchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
  adminResetUserPasswordSchema,
  adminChangePasswordSchema,
  aiSchema,
  totpSignupSetupSchema,
  pushToggleSchema,
  pushSubscribeSchema,
  deliveryJobsQuerySchema,
  deliveryJobStatusSchema,
  marketplaceOrderCreateSchema,
  marketplaceOrdersQuerySchema,
  marketplaceOrderStatusSchema,
  marketplaceOrderNoteSchema,
  feedbackCreateSchema,
  feedbackListQuerySchema,
  bannerQuerySchema,
  bannerSchema,
  bannerUpdateSchema,
  locationGeocodeSchema
};
