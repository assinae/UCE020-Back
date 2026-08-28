/**
 * Apaga tudo que o seed criou. As FKs são ON DELETE CASCADE, então remover o
 * evento leva junto participações, atividades, convidado_atividade e certificados.
 */
const { Pool } = require('pg');
const { TAG, EMAIL_DOMAIN, pgConfig } = require('./config.cjs');

async function main() {
  const pool = new Pool(pgConfig);
  try {
    const evento = await pool.query(`delete from evento where codigo = $1 returning id`, [TAG]);
    const convidado = await pool.query(
      `delete from convidado where email like $1 returning id`,
      [`%@${EMAIL_DOMAIN}`],
    );
    const usuario = await pool.query(`delete from usuario where email like $1 returning id`, [
      `%@${EMAIL_DOMAIN}`,
    ]);

    console.log(
      JSON.stringify(
        {
          eventosRemovidos: evento.rowCount,
          convidadosRemovidos: convidado.rowCount,
          usuariosRemovidos: usuario.rowCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('cleanup falhou:', e.message);
  process.exit(1);
});
