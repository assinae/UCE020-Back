/**
 * Teste de carga do fluxo de certificados gerados sob demanda.
 *
 * Pré-requisitos: `node test/load/seed.cjs` já rodou e o back está no ar.
 * Uso: node test/load/run.cjs [--duracao=10] [--niveis=1,5,10,25,50]
 */
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { TAG, BASE_URL, JWT_SECRET, pgConfig } = require('./config.cjs');
const {
  resumo,
  faseDeCarga,
  iniciarSonda,
  pidDaPorta,
  iniciarMonitorMemoria,
  ms,
  mb,
} = require('./lib.cjs');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')),
);
const DURACAO_MS = Number(args.duracao ?? 10) * 1000;
const NIVEIS = String(args.niveis ?? '1,5,10,25,50').split(',').map(Number);
const PORTA = Number(new URL(BASE_URL).port || 80);
// --leitura pula emissão e assinatura: nenhuma escrita no banco, só os GETs de PDF.
const SOMENTE_LEITURA = 'leitura' in args;
// Quantos certificados distintos circulam. Um pool pequeno simula download
// repetido (cache quente); o pool inteiro simula todo mundo baixando o seu.
const POOL = Number(args.pool ?? 0);
// Um único ciclador para a corrida inteira, em vez de reiniciar a cada nível.
// Sem isso o nível N reaproveita os ids do nível N-1, que já estão em cache, e
// a medição de "cache miss" vira mentira.
const DISTINTOS = 'distintos' in args;

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

async function json(metodo, rota, { esperado = [200, 201] } = {}) {
  const t = performance.now();
  const r = await fetch(`${BASE_URL}${rota}`, {
    method: metodo,
    headers: auth(),
    signal: AbortSignal.timeout(600000),
  });
  const corpo = await r.json().catch(() => null);
  const duracaoMs = performance.now() - t;

  if (!esperado.includes(r.status)) {
    throw new Error(`${metodo} ${rota} -> ${r.status} ${JSON.stringify(corpo)}`);
  }
  return { corpo, duracaoMs, status: r.status };
}

function baixarPdf(proximoId) {
  return async () => {
    const r = await fetch(`${BASE_URL}/certificate/${proximoId()}/pdf`, {
      headers: auth(),
      signal: AbortSignal.timeout(120000),
    });
    const buf = await r.arrayBuffer();
    return { ok: r.ok, bytes: buf.byteLength, label: `HTTP ${r.status}` };
  };
}

function ciclador(lista) {
  let i = 0;
  let voltas = 0;
  const proximo = () => {
    if (i > 0 && i % lista.length === 0) voltas++;
    return lista[i++ % lista.length];
  };
  proximo.voltas = () => voltas;
  proximo.usados = () => i;
  return proximo;
}

async function main() {
  const pool = new Pool(pgConfig);
  const relatorio = {
    iniciadoEm: new Date().toISOString(),
    baseUrl: BASE_URL,
    fases: {},
  };

  const {
    rows: [ctx],
  } = await pool.query(
    `select e.id evento_id, a.id atividade_id, u.id organizador_id, u.nome, u.email
       from evento e
       join atividade a on a.evento_id = e.id
       join participacao p on p.evento_id = e.id and p.tipo = 'organizador'
       join usuario u on u.id = p.usuario_id
      where e.codigo = $1
      order by p.id limit 1`,
    [TAG],
  );

  if (!ctx) {
    console.error('Nenhum evento de carga encontrado. Rode: node test/load/seed.cjs');
    process.exit(1);
  }

  token = jwt.sign(
    { id: ctx.organizador_id, name: ctx.nome, email: ctx.email },
    JWT_SECRET,
    { expiresIn: '2h' },
  );

  const {
    rows: [{ total: totalParticipantes }],
  } = await pool.query(
    `select count(*)::int total from participacao where evento_id = $1`,
    [ctx.evento_id],
  );

  console.log('\n### Contexto');
  console.log(
    `evento ${ctx.evento_id} | atividade ${ctx.atividade_id} | ${totalParticipantes} participantes`,
  );
  console.log(`alvo: ${BASE_URL}`);

  const pid = await pidDaPorta(PORTA);
  console.log(
    `pid do servidor na porta ${PORTA}: ${pid ?? 'nao identificado (sem metrica de memoria)'}`,
  );
  const memoria = iniciarMonitorMemoria(pid);

  if (SOMENTE_LEITURA) {
    console.log('\nmodo --leitura: fases 1 e 2 (emissao/assinatura) puladas');
  }

  // --- Fase 1: emissão em lote --------------------------------------------
  if (!SOMENTE_LEITURA) {
  console.log('\n### Fase 1 - emissao em lote');
  const emissaoParticipantes = await json(
    'POST',
    `/event/${ctx.evento_id}/certificate/participants`,
  );
  console.log(
    `participantes: ${emissaoParticipantes.corpo.data.issued} emitidos em ${ms(emissaoParticipantes.duracaoMs)}`,
  );

  const emissaoConvidados = await json(
    'POST',
    `/activity/${ctx.atividade_id}/certificate/guests`,
  );
  console.log(
    `convidados:    ${emissaoConvidados.corpo.data.issued} emitidos em ${ms(emissaoConvidados.duracaoMs)}`,
  );

  relatorio.fases.emissao = {
    participantes: {
      emitidos: emissaoParticipantes.corpo.data.issued,
      duracaoMs: emissaoParticipantes.duracaoMs,
    },
    convidados: {
      emitidos: emissaoConvidados.corpo.data.issued,
      duracaoMs: emissaoConvidados.duracaoMs,
    },
  };

  // --- Fase 2: assinatura em lote -----------------------------------------
  console.log('\n### Fase 2 - assinatura em lote');
  const sondaAssinatura = iniciarSonda(`${BASE_URL}/`);
  // Sem pendentes a rota devolve 404; force=true reassina tudo e mantém a fase
  // mensurável em execuções repetidas.
  let assinatura = await json('POST', `/event/${ctx.evento_id}/certificate/sign`, {
    esperado: [200, 201, 404],
  });
  if (assinatura.status === 404) {
    assinatura = await json('POST', `/event/${ctx.evento_id}/certificate/sign?force=true`);
  }
  const latenciaDuranteAssinatura = resumo(await sondaAssinatura.parar());

  const assinados = assinatura.corpo.data.assinados;
  console.log(
    `${assinados} assinados em ${ms(assinatura.duracaoMs)} (${(assinatura.duracaoMs / assinados).toFixed(1)}ms por certificado)`,
  );
  console.log(
    `sonda GET / durante a assinatura: p50 ${ms(latenciaDuranteAssinatura?.p50)} | p99 ${ms(latenciaDuranteAssinatura?.p99)} | max ${ms(latenciaDuranteAssinatura?.max)}`,
  );

  relatorio.fases.assinatura = {
    assinados,
    duracaoMs: assinatura.duracaoMs,
    msPorCertificado: assinatura.duracaoMs / assinados,
    sondaColateral: latenciaDuranteAssinatura,
  };
  }

  // --- Fase 3: custo unitário do PDF --------------------------------------
  const { rows: certs } = await pool.query(
    `select id from certificado_evento where evento_id = $1 order by id`,
    [ctx.evento_id],
  );
  const { rows: certsConvidado } = await pool.query(
    `select cc.id from certificado_convidado cc
       join atividade a on a.id = cc.atividade_id
      where a.evento_id = $1 order by cc.id`,
    [ctx.evento_id],
  );
  const todosIds = certs.map((c) => `user-${c.id}`);
  const ids = POOL > 0 ? todosIds.slice(0, POOL) : todosIds;
  const idsConvidado = certsConvidado.map((c) => `guest-${c.id}`);

  console.log(
    `\npool de certificados em circulacao: ${ids.length} de ${todosIds.length}${DISTINTOS ? ' (modo --distintos: sem repetir entre niveis)' : ''}`,
  );

  const cicladorGlobal = DISTINTOS ? ciclador(ids) : null;
  const proximoId = () => cicladorGlobal ?? ciclador(ids);

  console.log('\n### Fase 3 - custo unitario (1 requisicao por vez)');
  const unitario = await faseDeCarga({
    concurrency: 1,
    durationMs: 8000,
    request: baixarPdf(proximoId()),
  });
  console.log(
    `${unitario.ok} PDFs | p50 ${ms(unitario.latencia.p50)} | p95 ${ms(unitario.latencia.p95)} | max ${ms(unitario.latencia.max)} | ${unitario.rps.toFixed(1)} req/s | ${unitario.throughputMBs.toFixed(2)} MB/s`,
  );
  relatorio.fases.unitario = unitario;

  // --- Fase 4: rampa de concorrência --------------------------------------
  console.log(`\n### Fase 4 - rampa de concorrencia (${DURACAO_MS / 1000}s por nivel)`);
  console.log('| VUs | req/s | p50 | p95 | p99 | max | erros | sonda GET / p99 |');
  console.log('|---|---|---|---|---|---|---|---|');

  relatorio.fases.rampa = [];
  for (const nivel of NIVEIS) {
    const sonda = iniciarSonda(`${BASE_URL}/`);
    const r = await faseDeCarga({
      concurrency: nivel,
      durationMs: DURACAO_MS,
      request: baixarPdf(proximoId()),
    });
    const colateral = resumo(await sonda.parar());
    r.sondaColateral = colateral;
    relatorio.fases.rampa.push(r);

    const errosTxt = r.falhas
      ? `${r.falhas} (${Object.entries(r.erros)
          .map(([k, v]) => `${k} x${v}`)
          .join(', ')})`
      : '0';
    console.log(
      `| ${nivel} | ${r.rps.toFixed(1)} | ${ms(r.latencia.p50)} | ${ms(r.latencia.p95)} | ${ms(r.latencia.p99)} | ${ms(r.latencia.max)} | ${errosTxt} | ${ms(colateral?.p99)} |`,
    );
  }

  if (cicladorGlobal) {
    const voltas = cicladorGlobal.voltas();
    console.log(
      voltas === 0
        ? `
${cicladorGlobal.usados()} requisicoes, todas em certificados distintos: medicao 100% cache miss.`
        : `
ATENCAO: o pool de ${ids.length} esgotou e reciclou ${voltas}x — os ultimos niveis tiveram cache hit.`,
    );
  }

  // --- Fase 5: PDF de convidado (renderer diferente) ----------------------
  if (idsConvidado.length) {
    console.log('\n### Fase 5 - PDF de convidado, concorrencia 10');
    const conv = await faseDeCarga({
      concurrency: 10,
      durationMs: DURACAO_MS,
      request: baixarPdf(ciclador(idsConvidado)),
    });
    console.log(
      `${conv.ok} PDFs | p50 ${ms(conv.latencia.p50)} | p95 ${ms(conv.latencia.p95)} | ${conv.rps.toFixed(1)} req/s | erros ${conv.falhas}`,
    );
    relatorio.fases.convidado = conv;
  }

  const mem = await memoria.parar();
  if (mem) {
    console.log('\n### Memoria do processo do servidor');
    console.log(
      `inicial ${mb(mem.inicial)} | pico ${mb(mem.pico)} | final ${mb(mem.final)} (${mem.amostras} amostras)`,
    );
    relatorio.memoria = mem;
  }

  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(
    dir,
    `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(arquivo, JSON.stringify(relatorio, null, 2));
  console.log(`\nrelatorio bruto: ${path.relative(process.cwd(), arquivo)}`);

  await pool.end();
}

main().catch((e) => {
  console.error('\nrun falhou:', e.message);
  process.exit(1);
});
