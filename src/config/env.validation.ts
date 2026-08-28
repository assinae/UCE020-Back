import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV:       Joi.string().valid('development', 'production', 'test').default('development'),
  PORT:           Joi.number().default(3000),
  DATABASE_URL:   Joi.string().required(),
  SUPABASE_URL:   Joi.string().uri().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_STORAGE_BUCKET: Joi.string().default('uploads'),
  SUPABASE_PUBLIC_STORAGE_URL: Joi.string().uri().allow('').optional(),

  // Obrigatórias de verdade. Sem elas a app subia "saudável" e falhava depois:
  // sem JWT_SECRET a verificação de token caía num segredo literal do repo, e
  // sem FRONTEND_URL o CORS bloqueia o front e o QR Code aponta para localhost.
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),
  FRONTEND_URL: Joi.string().uri().required(),

  // Opcionais por design, mas declaradas para aparecerem em um lugar só.
  // PUBLIC_BASE_URL e CERTIFICATE_VERIFY_URL sobrescrevem a base do link de
  // verificação; SIGNATURE_SECRET cai em JWT_SECRET quando ausente.
  PUBLIC_BASE_URL: Joi.string().uri().allow('').optional(),
  CERTIFICATE_VERIFY_URL: Joi.string().uri().allow('').optional(),
  SIGNATURE_SECRET: Joi.string().allow('').optional(),

  /**
   * Teto do cache de PDFs renderizados, em MB. Ver certificate-pdf.service.ts.
   * Aceita vazio para quem copiou o .env.example sem preencher.
   */
  CERTIFICATE_PDF_CACHE_MB: Joi.number().min(0).allow('').default(16),
  EMAIL_PROVIDER: Joi.string().valid('brevo', 'smtp').default('brevo'),
  BREVO_API_KEY: Joi.when('EMAIL_PROVIDER', {
    is: 'brevo',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  MAIL_FROM: Joi.string().email().required(),
  MAIL_FROM_NAME: Joi.string().default('Suporte Assinaê'),
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
