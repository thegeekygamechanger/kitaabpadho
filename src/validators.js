const { z } = require('zod');

const listingSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(1500),
  category: z.enum(['book', 'instrument', 'notes', 'video', 'pdf']),
  listingType: z.enum(['rent', 'buy']),
  price: z.number().min(0),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().min(2).max(100).optional().default('Unknown')
});

const aiSchema = z.object({
  prompt: z.string().min(5).max(2000)
});

module.exports = { listingSchema, aiSchema };
