/**
 * Exercita o fluxo de certificado por atividade ponta a ponta em dev.
 * O codigo veio do PR #105 e nunca rodou com dado: certificado_atividade
 * esta com zero linhas.
 *
 * Uso: node test/load/atividade-e2e.cjs [--atividade=29] [--evento=53] [--revert]
 */
require('dotenv/config');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = 'http://127.0.0.1:3001/api/v1';
const args = process.argv.slice(2);
const REVERT = args.includes('--revert');
const num = (flag, padrao) => {
  const a = args.find((x) => x.startsWith(flag + '='));
  return a ? Number(a.split('=')[1]) : padrao;
};
// Padrões apontam para a atividade de dev que tem presença registrada.
const ATIVIDADE = num('--atividade', 29);
const EVENTO = num('--evento', 53);

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  if (REVERT) {
    const cert = await c.query(
      'delete from certificado_atividade where atividade_id = $1 returning id',
      [ATIVIDADE],
    );
    await c.query(
      'update atividade set gerar_certificado = false where id = $1',
      [ATIVIDADE],
    );
    console.log(
      JSON.stringify({
        certificadosRemovidos: cert.rowCount,
        gerarCertificadoVoltouPara: false,
      }),
    );
    await c.end();
    return;
  }

  const {
    rows: [org],
  } = await c.query(
    `select u.id, u.nome, u.email from participacao p
       join usuario u on u.id = p.usuario_id
      where p.evento_id = $1 and p.tipo = 'organizador' limit 1`,
    [EVENTO],
  );
  const tokenOrg = jwt.sign(
    { id: org.id, name: org.nome, email: org.email },
    process.env.JWT_SECRET,
    { expiresIn: '30m' },
  );
  const authOrg = { Authorization: `Bearer ${tokenOrg}` };

  const chamar = async (metodo, rota, headers = authOrg) => {
    const r = await fetch(`${BASE}${rota}`, {
      method: metodo,
      headers,
      signal: AbortSignal.timeout(300000),
    });
    const txt = await r.text();
    return { status: r.status, corpo: txt };
  };

  console.log(`organizador: ${org.nome} (id ${org.id})\n`);

  console.log('=== 1. emitir SEM habilitar gerar_certificado (deve dar 403) ===');
  let r = await chamar('POST', `/activity/${ATIVIDADE}/certificate/participants`);
  console.log(`${r.status} ${r.corpo.slice(0, 170)}\n`);

  console.log('=== 2. habilitando gerar_certificado e reemitindo ===');
  await c.query('update atividade set gerar_certificado = true where id = $1', [
    ATIVIDADE,
  ]);
  r = await chamar('POST', `/activity/${ATIVIDADE}/certificate/participants`);
  console.log(`${r.status} ${r.corpo.slice(0, 220)}\n`);

  const { rows: criados } = await c.query(
    `select ca.id, ca.usuario_id, ca.assinado, u.nome, u.email
       from certificado_atividade ca join usuario u on u.id = ca.usuario_id
      where ca.atividade_id = $1 order by ca.id`,
    [ATIVIDADE],
  );
  console.log(`linhas em certificado_atividade: ${criados.length}`);

  console.log('\n=== 3. idempotencia (reemitir de novo) ===');
  r = await chamar('POST', `/activity/${ATIVIDADE}/certificate/participants`);
  console.log(`${r.status} ${r.corpo.slice(0, 150)}\n`);

  console.log('=== 4. a assinatura em lote do evento cobre atividade? ===');
  r = await chamar('POST', `/event/${EVENTO}/certificate/sign?force=true`);
  console.log(`POST /event/${EVENTO}/certificate/sign -> ${r.status}`);
  const { rows: [ass] } = await c.query(
    `select count(*)::int total, count(*) filter (where assinado)::int assinados
       from certificado_atividade where atividade_id = $1`,
    [ATIVIDADE],
  );
  console.log(`certificado_atividade: ${ass.assinados}/${ass.total} assinados\n`);

  console.log('=== 5. download do PDF (como titular) ===');
  const alvo = criados[0];
  if (alvo) {
    const tk = jwt.sign(
      { id: alvo.usuario_id, name: alvo.nome, email: alvo.email },
      process.env.JWT_SECRET,
      { expiresIn: '30m' },
    );
    const rr = await fetch(`${BASE}/certificate/activity-${alvo.id}/pdf`, {
      headers: { Authorization: `Bearer ${tk}` },
      signal: AbortSignal.timeout(120000),
    });
    const buf = Buffer.from(await rr.arrayBuffer());
    console.log(
      `GET /certificate/activity-${alvo.id}/pdf -> ${rr.status} | ${buf.length}b | %PDF=${buf.subarray(0, 4).toString() === '%PDF'} | etag=${(rr.headers.get('etag') || '-').slice(0, 16)}...`,
    );
    if (!rr.ok) console.log('   corpo:', buf.toString('utf8').slice(0, 200));

    console.log('\n=== 6. aparece nas listagens? ===');
    const me = await chamar('GET', '/certificate/me', {
      Authorization: `Bearer ${tk}`,
    });
    const temAtividade = me.corpo.includes('activity-');
    console.log(
      `GET /certificate/me -> ${me.status} | contem id "activity-"? ${temAtividade}`,
    );

    const lista = await chamar('GET', `/event/${EVENTO}/certificate?limit=200`);
    console.log(
      `GET /event/${EVENTO}/certificate -> ${lista.status} | contem "activity-"? ${lista.corpo.includes('activity-')}`,
    );

    const stats = await chamar('GET', `/event/${EVENTO}/certificate/stats`);
    console.log(`GET .../stats -> ${stats.status} ${stats.corpo.slice(0, 200)}`);
  }

  console.log(
    '\n--- para desfazer: node test/load/_atividade-e2e.cjs --revert ---',
  );
  await c.end();
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
