const { z } = require('zod');

const schema = z.object({
  PORT:                    z.string().default('5000'),
  NODE_ENV:                z.enum(['development','production','test']).default('development'),

  DB_HOST:                 z.string().default('localhost'),
  DB_PORT:                 z.string().default('5432'),
  DB_NAME:                 z.string().default('vidyasetu_db'),
  DB_USER:                 z.string().default('postgres'),
  DB_PASSWORD:             z.string().default(''),
  DB_POOL_MIN:             z.string().default('2'),
  DB_POOL_MAX:             z.string().default('10'),

  REDIS_URL:               z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET:       z.string().min(10).default('dev_access_secret_changeme_32chars!!'),
  JWT_REFRESH_SECRET:      z.string().min(10).default('dev_refresh_secret_changeme_32chars!'),
  JWT_ACCESS_EXPIRY:       z.string().default('15m'),
  JWT_REFRESH_EXPIRY:      z.string().default('30d'),

  OTP_EXPIRY_MINUTES:      z.string().default('10'),
  OTP_MAX_ATTEMPTS:        z.string().default('3'),

  SMS_PROVIDER:            z.enum(['kaleyra','twofactor','mock']).default('mock'),
  WHATSAPP_PROVIDER:       z.enum(['interakt','gupshup','mock']).default('mock'),
  AI_PROVIDER:             z.enum(['openai','gemini','mock']).default('mock'),

  AWS_REGION:              z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID:       z.string().default('mock'),
  AWS_SECRET_ACCESS_KEY:   z.string().default('mock'),
  S3_BUCKET_NAME:          z.string().default('vidyasetu-content'),

  RAZORPAY_KEY_ID:         z.string().default('rzp_test_mock'),
  RAZORPAY_KEY_SECRET:     z.string().default('mock'),

  FRONTEND_URL:            z.string().default('http://localhost:3000'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  parsed.error.issues.forEach(i => console.error(`   ${i.path.join('.')}: ${i.message}`));
  // In development, warn but don't crash
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

module.exports = parsed.data || process.env;
