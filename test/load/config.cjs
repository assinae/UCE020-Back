require('dotenv/config');

/**
 * Tudo que o seed cria carrega uma dessas marcas, e o cleanup apaga por elas.
 * Sem isso não há como distinguir dado de teste de dado real no banco compartilhado.
 */
const TAG = 'LOADTEST';
const EMAIL_DOMAIN = 'loadtest.local';

module.exports = {
  TAG,
  EMAIL_DOMAIN,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET || 'sua-chave-secreta-super-segura',
  BASE_URL: process.env.LOAD_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3001}/api/v1`,
  ORGANIZER_EMAIL: `organizador@${EMAIL_DOMAIN}`,
  ORGANIZER_PASSWORD: 'LoadTest@123',
  pgConfig: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  },
};
