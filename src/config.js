const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

module.exports = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'replace-me',
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'kp_session',
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 7 * 24 * 60 * 60),
  databaseUrl: process.env.DATABASE_URL || '',
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    bucket: process.env.R2_BUCKET || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    publicUrl: process.env.R2_PUBLIC_URL || ''
  },
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    modelGemini: process.env.AI_MODEL_GEMINI || 'gemini-1.5-flash',
    modelGroq: process.env.AI_MODEL_GROQ || 'llama-3.1-8b-instant',
    geminiWeight: Number(process.env.AI_GEMINI_WEIGHT || 0.75)
  }
};
