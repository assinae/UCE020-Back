/**
 * Renderiza TODOS os certificados reais do banco pelo endpoint sob demanda,
 * cada um baixado pelo seu proprio titular. Sai com codigo 1 se algum falhar,
 * entao serve de porta antes de promover para producao.
 * O teste de carga usou massa sintética com campos limpos; os certificados
 * antigos podem ter assinante nulo, evento sem carga horária, nome com acento,
 * data fora do range esperado. É aqui que isso aparece.
 */
require('dotenv/config');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = 'http://127.0.0.1:3001/api/v1';

// cert.uid é o titular; cert.id é o certificado. Confundir os dois faz o
// endpoint responder 403 e parecer bug de produto.
const token = (cert) =>
  jwt.sign(
    { id: cert.uid, name: cert.nome, email: cert.email },
    process.env.JWT_SECRET,
    { expiresIn: '30m' },
  );

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Certificados de evento: baixa como o titular, que é o caminho real.
  const { rows: eventoCerts } = await c.query(`
    select ce.id, ce.assinado, ce.arquivo_pdf is not null tem_url,
           u.id uid, u.nome, u.email,
           e.nome evento, e."cargaHoraria" carga,
           e.assinante1_nome, e.assinante2_nome
      from certificado_evento ce
      join usuario u on u.id = ce.usuario_id
      join evento e on e.id = ce.evento_id
     order by ce.id`);

  const { rows: convidadoCerts } = await c.query(`
    select cc.id from certificado_convidado cc order by cc.id`);

  const { rows: atividadeCerts } = await c.query(`
    select ca.id from certificado_atividade ca order by ca.id`);

  await c.end();

  console.log(
    `certificado_evento: ${eventoCerts.length} | certificado_convidado: ${convidadoCerts.length} | certificado_atividade: ${atividadeCerts.length}\n`,
  );

  const falhas = [];
  let ok = 0;
  const tamanhos = [];

  for (const cert of eventoCerts) {
    const r = await fetch(`${BASE}/certificate/user-${cert.id}/pdf`, {
      headers: { Authorization: `Bearer ${token(cert)}` },
      signal: AbortSignal.timeout(120000),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const valido = r.ok && buf.subarray(0, 4).toString() === '%PDF';

    if (valido) {
      ok++;
      tamanhos.push(buf.length);
    } else {
      falhas.push({
        id: `user-${cert.id}`,
        status: r.status,
        titular: cert.nome,
        evento: cert.evento,
        corpo: buf.toString('utf8').slice(0, 160),
      });
    }

    const flags = [
      cert.assinado ? 'assinado' : 'NAO assinado',
      cert.tem_url ? 'tem arquivo_pdf' : 'sem arquivo_pdf',
      cert.carga == null ? 'SEM carga horaria' : null,
      !cert.assinante1_nome ? 'SEM assinante1' : null,
      !cert.assinante2_nome ? 'SEM assinante2' : null,
    ]
      .filter(Boolean)
      .join(', ');

    console.log(
      `user-${String(cert.id).padEnd(4)} ${String(r.status).padEnd(4)} ${String(buf.length).padStart(7)}b  ${cert.evento.slice(0, 22).padEnd(24)} [${flags}]`,
    );
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`renderizaram: ${ok}/${eventoCerts.length}`);
  if (tamanhos.length) {
    console.log(
      `tamanho: min ${Math.min(...tamanhos)}b | max ${Math.max(...tamanhos)}b`,
    );
  }
  if (falhas.length) {
    console.log(`\nFALHAS (${falhas.length}):`);
    for (const f of falhas) console.log(JSON.stringify(f, null, 2));
    process.exitCode = 1;
  } else {
    console.log('nenhuma falha');
  }
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
