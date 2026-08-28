#!/usr/bin/env node
/**
 * Roda o ESLint apenas nos arquivos .ts que ESTA branch alterou.
 *
 * Motivo: `npm run lint` é `eslint --fix` no src inteiro, e como o repositório
 * ainda não está formatado segundo o próprio .prettierrc (49 arquivos fora do
 * padrão), qualquer execução reformata dezenas de arquivos sem relação com a
 * alteração em curso — o diff explode e a revisão fica impossível.
 *
 * Uso:
 *   npm run lint:diff           # só reporta, não altera nada
 *   npm run lint:diff -- --fix  # corrige, mas só nos arquivos desta branch
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

function baseDeComparacao() {
  for (const ref of ['origin/dev', 'origin/main']) {
    try {
      git(['rev-parse', '--verify', ref]);
      // merge-base: considera só o que esta branch adicionou, ignorando o que
      // entrou na base depois que ela foi criada.
      return git(['merge-base', 'HEAD', ref]);
    } catch {
      /* ref não existe, tenta a próxima */
    }
  }
  return null;
}

const base = baseDeComparacao();
if (!base) {
  console.error('Não encontrei origin/dev nem origin/main. Rode `git fetch origin`.');
  process.exit(1);
}

const alterados = git(['diff', '--name-only', '--diff-filter=ACMR', base]).split('\n');
const novos = git(['ls-files', '--others', '--exclude-standard']).split('\n');

const arquivos = [...alterados, ...novos]
  .map((f) => f.trim())
  .filter((f) => f.endsWith('.ts'))
  .filter((f) => existsSync(f));

if (arquivos.length === 0) {
  console.log('Nenhum arquivo .ts alterado nesta branch. Nada a checar.');
  process.exit(0);
}

console.log(`Checando ${arquivos.length} arquivo(s) alterado(s) nesta branch:`);
for (const f of arquivos) console.log('  ' + f);
console.log('');

const extras = process.argv.slice(2);
const r = spawnSync('npx', ['--no-install', 'eslint', ...arquivos, ...extras], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
