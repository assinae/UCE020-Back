/**
 * Decompõe o custo de um download de certificado: quanto é ida-e-volta ao
 * banco e quanto é CPU de renderização do PDF.
 *
 * Roda contra o build (`npm run build`), sem passar pelo HTTP.
 * Uso: node test/load/bench.cjs [iteracoes]
 */
const { performance } = require('node:perf_hooks');
const { Pool } = require('pg');
const { TAG, pgConfig } = require('./config.cjs');
const { resumo, ms } = require('./lib.cjs');

const N = Number(process.argv[2] ?? 20);

const { renderParticipantCertificatePdf } = require('../../dist/src/modules/certificate/pdf/participant-certificate.pdf');
const { gerarQrPng } = require('../../dist/src/modules/certificate/signature/qr');

async function medir(label, n, fn) {
  const amostras = [];
  let ultimo;
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    ultimo = await fn(i);
    amostras.push(performance.now() - t);
  }
  const r = resumo(amostras);
  console.log(`${label.padEnd(34)} p50 ${ms(r.p50).padStart(8)} | p95 ${ms(r.p95).padStart(8)} | media ${ms(r.media).padStart(8)}`);
  return { label, ...r, ultimo };
}

async function main() {
  const pool = new Pool(pgConfig);

  const { rows: [{ id: certId }] } = await pool.query(
    `select ce.id from certificado_evento ce
       join evento e on e.id = ce.evento_id
      where e.codigo = $1 order by ce.id limit 1`,
    [TAG],
  );

  console.log(`\n### Decomposicao do custo (${N} iteracoes, certificado ${certId})\n`);

  await medir('1. round-trip Neon (select 1)', N, () => pool.query('select 1'));

  const consulta = await medir('2. query de render (3 joins)', N, () =>
    pool.query(
      `select ce.id, u.nome, e.nome evento, e."cargaHoraria", e.localizacao,
              e."dataInicio", e."dataFim", ce."dataEmissao", ce.codigo_verificacao,
              ce.assinado, ce.assinado_em, ce.assinatura_nome, p.tipo
         from certificado_evento ce
         join usuario u on u.id = ce.usuario_id
         join evento e on e.id = ce.evento_id
         join participacao p on p.usuario_id = ce.usuario_id and p.evento_id = ce.evento_id
        where ce.id = $1`,
      [certId],
    ),
  );

  const linha = consulta.ultimo.rows[0];

  await medir('3. gerarQrPng', N, () =>
    gerarQrPng('http://localhost:3000/certificate/verify/ABCD-EFGH-IJKL'),
  );

  const qr = await gerarQrPng('http://localhost:3000/certificate/verify/ABCD-EFGH-IJKL');

  const dados = {
    certificateId: linha.id,
    participantName: linha.nome,
    role: 'Ouvinte',
    eventName: linha.evento,
    workloadHours: linha.cargaHoraria,
    location: linha.localizacao,
    eventDate: '01 a 03 de agosto de 2026',
    issueDate: linha.dataEmissao,
    assinante1Nome: 'Prof. Dra. Fulana de Tal',
    assinante1Titulo: 'Reitora',
    assinante2Nome: 'Prof. Dr. Beltrano de Tal',
    assinante2Titulo: 'Coordenador de Extensao',
  };

  await medir('4. render PDF sem assinatura', N, () =>
    renderParticipantCertificatePdf(dados),
  );

  const comAssinatura = await medir('5. render PDF assinado (com QR)', N, () =>
    renderParticipantCertificatePdf({
      ...dados,
      assinatura: {
        nome: 'Organizador',
        data: '26/08/2026 as 20:00',
        codigo: 'ABCD-EFGH-IJKL',
        qr: qr ? { data: qr, format: 'png' } : undefined,
      },
    }),
  );

  console.log(`\ntamanho do PDF gerado: ${(comAssinatura.ultimo.length / 1024).toFixed(0)} KB`);
  console.log(`primeira renderizacao (cold, fontes): ver p95 vs p50 acima`);

  await pool.end();
}

main().catch((e) => {
  console.error('bench falhou:', e.message);
  process.exit(1);
});
