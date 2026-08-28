/**
 * Mede os dois cenários que o cache trata de forma diferente, na mesma
 * concorrência, sem contaminação entre eles:
 *   FRIO  — cada requisição pega um certificado distinto (todo mundo baixando
 *           o seu depois do e-mail de encerramento). 100% cache miss.
 *   QUENTE— pool pequeno, repetido (preview + download, F5). 100% cache hit
 *           depois da primeira volta.
 * Requer servidor recém-iniciado para o cenário frio valer.
 */
require('dotenv/config');
const { performance } = require('node:perf_hooks');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = 'http://127.0.0.1:3001/api/v1';
const VUS = Number(process.argv[2] ?? 25);
const SEGUNDOS = Number(process.argv[3] ?? 12);

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.ceil((p / 100) * arr.length) - 1)];

async function fase(rotulo, proximoId, auth) {
  const lat = [];
  let ok = 0, falhas = 0, bytes = 0;
  const fim = performance.now() + SEGUNDOS * 1000;

  const worker = async () => {
    while (performance.now() < fim) {
      const id = proximoId();
      if (!id) return;
      const t = performance.now();
      try {
        const r = await fetch(`${BASE}/certificate/${id}/pdf`, { headers: auth, signal: AbortSignal.timeout(120000) });
        const b = await r.arrayBuffer();
        lat.push(performance.now() - t);
        if (r.ok) { ok++; bytes += b.byteLength; } else falhas++;
      } catch { falhas++; }
    }
  };

  const t0 = performance.now();
  await Promise.all(Array.from({ length: VUS }, worker));
  const dur = (performance.now() - t0) / 1000;
  lat.sort((a, b) => a - b);

  console.log(
    `${rotulo.padEnd(34)} ${(ok / dur).toFixed(1).padStart(6)} req/s | p50 ${pct(lat, 50).toFixed(0).padStart(6)}ms | p95 ${pct(lat, 95).toFixed(0).padStart(6)}ms | ${ok} ok, ${falhas} falhas`,
  );
  return { rps: ok / dur, p50: pct(lat, 50) };
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const { rows: [c] } = await pool.query(
    `select u.id uid, u.nome, u.email from evento e
       join participacao p on p.evento_id=e.id and p.tipo='organizador'
       join usuario u on u.id=p.usuario_id where e.codigo='LOADTEST' order by p.id limit 1`);
  const auth = { Authorization: `Bearer ${jwt.sign({ id: c.uid, name: c.nome, email: c.email }, process.env.JWT_SECRET, { expiresIn: '30m' })}` };

  const { rows } = await pool.query(
    `select ce.id from certificado_evento ce join evento e on e.id=ce.evento_id
      where e.codigo='LOADTEST' order by ce.id`);
  const ids = rows.map((r) => `user-${r.id}`);
  await pool.end();

  console.log(`\nconcorrencia ${VUS}, ${SEGUNDOS}s por fase, ${ids.length} certificados disponiveis\n`);

  // Ciclador que NUNCA repete: esgota o pool antes de parar.
  let i = 0;
  await fase('FRIO (todos distintos)', () => ids[i++], auth);

  // Pool de 15, repetido a exaustao.
  let j = 0;
  const quentes = ids.slice(0, 15);
  await fase('QUENTE (15 certs repetidos)', () => quentes[j++ % quentes.length], auth);
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
