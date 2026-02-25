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
    geminiWeight: Number(process.env.AI_GEMINI_WEIGHT || 0.75),
    primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'auto',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000),
    groqBaseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
  },
  push: {
    vapidPublicKey:
      process.env.VAPID_PUBLIC_KEY ||
      'BPgXE2f8tT3LSJosRbIXRoWwiBQ738xZBayx_LbYQ0EVkDUJPWdBL6oC0X-AbRVsGTh4zeLgocMMrvLh2r2K1Fs',
    vapidPrivateKey:
      process.env.VAPID_PRIVATE_KEY ||
      'INPlk2uJtJM9fozQ7fth7LXkDUdvmJDwMlU4l26iTU8',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@kitaabpadho.in'
  },
  payments: {
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
    currency: process.env.RAZORPAY_CURRENCY || 'INR'
  }
};
