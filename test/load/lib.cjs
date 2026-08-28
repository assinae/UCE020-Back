const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function percentil(ordenado, p) {
  if (!ordenado.length) return NaN;
  const i = Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1);
  return ordenado[Math.max(0, i)];
}

function resumo(amostras) {
  const validas = amostras.filter(Number.isFinite).sort((a, b) => a - b);
  if (!validas.length) return null;
  return {
    n: validas.length,
    min: validas[0],
    p50: percentil(validas, 50),
    p95: percentil(validas, 95),
    p99: percentil(validas, 99),
    max: validas[validas.length - 1],
    media: validas.reduce((a, b) => a + b, 0) / validas.length,
  };
}

const ms = (v) => (Number.isFinite(v) ? `${v.toFixed(0)}ms` : '—');
const mb = (v) => (Number.isFinite(v) ? `${(v / 1024 / 1024).toFixed(1)}MB` : '—');

/** Executa `request` com `concurrency` workers em paralelo até estourar a duração. */
async function faseDeCarga({ concurrency, durationMs, request }) {
  const latencias = [];
  const erros = new Map();
  let ok = 0;
  let falhas = 0;
  let bytes = 0;

  const inicio = performance.now();
  const limite = inicio + durationMs;

  const worker = async () => {
    while (performance.now() < limite) {
      const t = performance.now();
      try {
        const r = await request();
        latencias.push(performance.now() - t);
        if (r.ok) {
          ok++;
          bytes += r.bytes;
        } else {
          falhas++;
          erros.set(r.label, (erros.get(r.label) ?? 0) + 1);
        }
      } catch (e) {
        latencias.push(performance.now() - t);
        falhas++;
        const label = e.cause?.code ?? e.code ?? e.name ?? e.message;
        erros.set(String(label), (erros.get(String(label)) ?? 0) + 1);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  const duracaoS = (performance.now() - inicio) / 1000;

  return {
    concurrency,
    duracaoS,
    ok,
    falhas,
    rps: (ok + falhas) / duracaoS,
    throughputMBs: bytes / 1024 / 1024 / duracaoS,
    latencia: resumo(latencias),
    erros: Object.fromEntries(erros),
  };
}

/**
 * Sonda de baixa frequência num endpoint trivial. É o que revela bloqueio do
 * event loop: se um GET sem I/O passa a levar segundos, o Node inteiro travou.
 */
function iniciarSonda(url, intervaloMs = 200) {
  const amostras = [];
  let parar = false;

  const loop = (async () => {
    while (!parar) {
      const t = performance.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        await r.text();
        amostras.push(performance.now() - t);
      } catch {
        amostras.push(NaN);
      }
      await sleep(intervaloMs);
    }
  })();

  return {
    async parar() {
      parar = true;
      await loop;
      return amostras;
    },
  };
}

/** PID do processo que está escutando a porta (Windows). */
async function pidDaPorta(porta) {
  return new Promise((resolve) => {
    const ps = spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `(Get-NetTCPConnection -LocalPort ${porta} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`,
      ],
      { windowsHide: true },
    );
    let out = '';
    ps.stdout.on('data', (d) => (out += d));
    ps.on('close', () => resolve(Number(out.trim()) || null));
    ps.on('error', () => resolve(null));
  });
}

/** Amostra RSS do processo do servidor em background, sem interferir nele. */
function iniciarMonitorMemoria(pid) {
  if (!pid) return { parar: async () => null };

  const amostras = [];
  const ps = spawn(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `while ($true) { $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p -eq $null) { break }; Write-Output "$($p.WorkingSet64)"; Start-Sleep -Milliseconds 500 }`,
    ],
    { windowsHide: true },
  );

  let buffer = '';
  ps.stdout.on('data', (d) => {
    buffer += d;
    const linhas = buffer.split(/\r?\n/);
    buffer = linhas.pop() ?? '';
    for (const linha of linhas) {
      const v = Number(linha.trim());
      if (Number.isFinite(v) && v > 0) amostras.push(v);
    }
  });
  ps.on('error', () => {});

  return {
    async parar() {
      ps.kill();
      if (!amostras.length) return null;
      return {
        inicial: amostras[0],
        pico: Math.max(...amostras),
        final: amostras[amostras.length - 1],
        amostras: amostras.length,
      };
    },
  };
}

module.exports = { sleep, resumo, faseDeCarga, iniciarSonda, pidDaPorta, iniciarMonitorMemoria, ms, mb };
