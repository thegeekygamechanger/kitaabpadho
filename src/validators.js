const { z } = require('zod');

const categories = ['book', 'instrument', 'notes', 'video', 'pdf'];
const listingTypes = ['rent', 'buy', 'sell'];
const areaCodes = ['loni_kalbhor', 'hadapsar', 'camp', 'other'];

const categoryEnum = z.enum(categories);
const listingTypeEnum = z.enum(listingTypes);
const areaCodeEnum = z.enum(areaCodes);

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
  price: z.number().min(0),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().trim().min(2).max(100).optional().default('Unknown'),
  areaCode: areaCodeEnum.optional().default('other')
});

const listingQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: categoryEnum.optional(),
  listingType: listingTypeEnum.optional(),
  city: z.string().trim().min(1).max(100).optional(),
  areaCode: z.union([areaCodeEnum, z.literal('all')]).optional(),
  lat: optionalNumber(z.number().min(-90).max(90)),
  lon: optionalNumber(z.number().min(-180).max(180)),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'distance']).optional().default('newest'),
  limit: optionalNumber(z.number().int().min(1).max(100)).default(24),
  offset: optionalNumber(z.number().int().min(0).max(10000)).default(0)
});

const authRegisterSchema = z.object({
  email: z.string().trim().email().max(180),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(128)
});

const authLoginSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(128)
});

const communityPostSchema = z.object({
  title: z.string().trim().min(5).max(160),
  content: z.string().trim().min(10).max(4000),
  categorySlug: z.string().trim().min(2).max(64).regex(/^[a-z0-9-]+$/)
});

const communityCommentSchema = z.object({
  content: z.string().trim().min(1).max(1000)
});

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
  prompt: z.string().min(5).max(2000)
});

module.exports = {
  categories,
  listingTypes,
  areaCodes,
  listingSchema,
  listingQuerySchema,
  authRegisterSchema,
  authLoginSchema,
  communityPostSchema,
  communityCommentSchema,
  communityListQuerySchema,
  adminActionQuerySchema,
  aiSchema
};
