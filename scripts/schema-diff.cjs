/**
 * Mostra, SOMENTE LEITURA, o que um `npm run db:push` faria no banco apontado
 * por DATABASE_URL. Nada é alterado.
 *
 * Pré-requisito: `npm run build` (lê o schema compilado em dist/).
 * Uso:  npm run db:diff
 *       DATABASE_URL="postgresql://..." npm run db:diff   # outro banco
 *
 * Saída:
 *   exit 0  — sincronizado, ou só adições (push é seguro)
 *   exit 1  — o push REMOVERIA tabela ou coluna (e os dados junto)
 *   exit 2  — erro ao conectar ou ao ler o schema
 */
require('dotenv/config');
const { Client } = require('pg');
const { getTableConfig } = require('drizzle-orm/pg-core');

let schema;
try {
  schema = require('../dist/src/db/schema');
} catch {
  console.error('Não achei dist/src/db/schema.js. Rode `npm run build` antes.');
  process.exit(2);
}

function colunasDoCodigo() {
  const mapa = new Map();
  for (const obj of Object.values(schema)) {
    let cfg;
    try {
      cfg = getTableConfig(obj);
    } catch {
      continue; // relations e enums não são tabelas
    }
    mapa.set(
      cfg.name,
      new Map(
        cfg.columns.map((c) => [
          c.name,
          { tipo: c.getSQLType(), notNull: c.notNull, temDefault: c.hasDefault },
        ]),
      ),
    );
  }
  return mapa;
}

async function colunasDoBanco(client) {
  const { rows } = await client.query(`
    select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns
     where table_schema = 'public'
     order by table_name, ordinal_position`);

  const mapa = new Map();
  for (const r of rows) {
    if (!mapa.has(r.table_name)) mapa.set(r.table_name, new Map());
    mapa.get(r.table_name).set(r.column_name, {
      tipo: r.data_type,
      notNull: r.is_nullable === 'NO',
      default: r.column_default,
    });
  }
  return mapa;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definida.');
    process.exit(2);
  }

  const alvo = new URL(url);
  console.log('=== ALVO ===');
  console.log(`host    : ${alvo.hostname}`);
  console.log(`database: ${alvo.pathname.slice(1).split('?')[0]}`);
  console.log(`usuario : ${alvo.username}`);
  console.log('Confirme que é o banco certo antes de rodar o push.\n');

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const codigo = colunasDoCodigo();
  const banco = await colunasDoBanco(client);
  await client.end();

  const criaria = [];
  const removeria = [];
  const alteraria = [];

  for (const [tabela, cols] of codigo) {
    if (!banco.has(tabela)) {
      criaria.push(`tabela ${tabela} (${cols.size} colunas)`);
      continue;
    }
    const atual = banco.get(tabela);

    for (const [nome, def] of cols) {
      if (!atual.has(nome)) {
        criaria.push(
          `${tabela}.${nome}  ${def.tipo}${def.notNull ? ' NOT NULL' : ''}${def.temDefault ? ' (com default)' : ''}`,
        );
      } else if (atual.get(nome).notNull !== def.notNull) {
        alteraria.push(
          `${tabela}.${nome}  notNull: banco=${atual.get(nome).notNull} → código=${def.notNull}`,
        );
      }
    }
    for (const nome of atual.keys()) {
      if (!cols.has(nome)) removeria.push(`${tabela}.${nome}`);
    }
  }

  for (const tabela of banco.keys()) {
    if (!codigo.has(tabela)) removeria.push(`tabela ${tabela} INTEIRA`);
  }

  console.log('=== O QUE O PUSH CRIARIA ===');
  console.log(criaria.length ? criaria.map((l) => `  + ${l}`).join('\n') : '  (nada)');

  console.log('\n=== O QUE O PUSH ALTERARIA ===');
  console.log(alteraria.length ? alteraria.map((l) => `  ~ ${l}`).join('\n') : '  (nada)');

  console.log('\n=== O QUE O PUSH REMOVERIA (leva os dados junto) ===');
  console.log(removeria.length ? removeria.map((l) => `  - ${l}`).join('\n') : '  (nada)');

  console.log('');
  if (removeria.length) {
    console.log(
      'ATENÇÃO: há remoções. O drizzle-kit vai PERGUNTAR antes — leia com cuidado.',
    );
    console.log('Não rode o push sem um snapshot e sem entender cada linha acima.');
    process.exit(1);
  }

  if (!criaria.length && !alteraria.length) {
    console.log('Sincronizado: o push não teria nada para fazer.');
  } else {
    console.log('Só adições/alterações. O push aplica direto, sem prompt.');
  }
}

main().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exit(2);
});
