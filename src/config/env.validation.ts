import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV:       Joi.string().valid('development', 'production', 'test').default('development'),
  PORT:           Joi.number().default(3000),
  DATABASE_URL:   Joi.string().required(),
  SUPABASE_URL:   Joi.string().uri().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_STORAGE_BUCKET: Joi.string().default('uploads'),
  SUPABASE_PUBLIC_STORAGE_URL: Joi.string().uri().allow('').optional(),
  // JWT_SECRET:     Joi.string().min(32).required(),
  // JWT_EXPIRES_IN: Joi.string().default('7d'),
  // FRONTEND_URL:   Joi.string().uri().required(),
  EMAIL_PROVIDER: Joi.string().valid('brevo', 'smtp').default('brevo'),
  BREVO_API_KEY: Joi.when('EMAIL_PROVIDER', {
    is: 'brevo',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  MAIL_FROM: Joi.string().email().required(),
  MAIL_FROM_NAME: Joi.string().default('Suporte Assinae'),
  MAIL_HOST: Joi.when('EMAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  MAIL_PORT: Joi.when('EMAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.number().required(),
    otherwise: Joi.number().allow('').optional(),
  }),
  MAIL_USER: Joi.when('EMAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  MAIL_PASS: Joi.when('EMAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
});
