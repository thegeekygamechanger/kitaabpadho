const { z } = require('zod');

const categories = ['book', 'instrument', 'notes', 'video', 'pdf', 'stationery', 'stationary'];
const listingTypes = ['rent', 'buy', 'sell'];
const areaCodes = ['loni_kalbhor', 'hadapsar', 'camp', 'other'];
const sellerTypes = ['student', 'library', 'reseller', 'wholesaler', 'college', 'individual_seller', 'shop'];
const deliveryModes = ['peer_to_peer', 'seller_dedicated', 'kpi_dedicated'];
const paymentModes = ['cod', 'upi', 'card', 'razorpay'];

const categoryEnum = z.enum(categories);
const listingTypeEnum = z.enum(listingTypes);
const areaCodeEnum = z.enum(areaCodes);
const sellerTypeEnum = z.enum(sellerTypes);
const deliveryModeEnum = z.enum(deliveryModes);
const paymentModeEnum = z.enum(paymentModes);

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
  paymentModes: z.array(paymentModeEnum).min(1).max(4).optional().default(['cod']),
  price: z.number().min(0),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().trim().min(2).max(100).optional().default('Unknown'),
  areaCode: areaCodeEnum.optional().default('other')
});
const listingUpdateSchema = listingSchema;

const listingQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: categoryEnum.optional(),
  listingType: listingTypeEnum.optional(),
  sellerType: sellerTypeEnum.optional(),
  city: z.string().trim().min(1).max(100).optional(),
  areaCode: z.union([areaCodeEnum, z.literal('all')]).optional(),
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
    phoneNumber: z.string().trim().regex(/^[0-9]{10,15}$/).optional(),
    password: z.string().min(8).max(128),
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
  phoneNumber: z.string().trim().regex(/^[0-9]{10,15}$/).optional().or(z.literal(''))
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
  status: z.enum(['open', 'claimed', 'completed', 'cancelled']).optional().default('open'),
  limit: optionalNumber(z.number().int().min(1).max(100)).default(25),
  offset: optionalNumber(z.number().int().min(0).max(10000)).default(0)
});
const deliveryJobStatusSchema = z.object({
  status: z.enum(['open', 'claimed', 'completed', 'cancelled'])
});

const razorpayOrderSchema = z.object({
  amount: z.number().positive(),
  receipt: z.string().trim().min(2).max(80).optional()
});

module.exports = {
  categories,
  listingTypes,
  areaCodes,
  sellerTypes,
  deliveryModes,
  paymentModes,
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
  adminResetUserPasswordSchema,
  adminChangePasswordSchema,
  aiSchema,
  totpSignupSetupSchema,
  pushToggleSchema,
  pushSubscribeSchema,
  deliveryJobsQuerySchema,
  deliveryJobStatusSchema,
  razorpayOrderSchema
};
