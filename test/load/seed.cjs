/**
 * Cria um evento sintético finalizado com N participantes e M convidados,
 * pronto para emitir/assinar/baixar certificados.
 *
 * Uso: node test/load/seed.cjs [participantes] [convidados]
 */
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { TAG, EMAIL_DOMAIN, ORGANIZER_EMAIL, ORGANIZER_PASSWORD, pgConfig } = require('./config.cjs');

const PARTICIPANTES = Number(process.argv[2] ?? 500);
const CONVIDADOS = Number(process.argv[3] ?? 20);

const FUNCOES_CONVIDADO = ['palestrante', 'ministrante', 'moderador'];

function tipoParticipacao(i) {
  if (i % 50 === 0) return 'organizador';
  if (i % 10 === 0) return 'monitor';
  return 'participante';
}

async function main() {
  const pool = new Pool(pgConfig);
  const t0 = Date.now();

  try {
    const existente = await pool.query(`select id from evento where codigo = $1`, [TAG]);
    if (existente.rowCount) {
      console.error(
        `Já existe evento de carga (id ${existente.rows[0].id}). Rode "node test/load/cleanup.cjs" antes.`,
      );
      process.exit(1);
    }

    const senhaHash = await bcrypt.hash(ORGANIZER_PASSWORD, 10);

    const { rows: [organizador] } = await pool.query(
      `insert into usuario (nome, email, senha, is_active) values ($1, $2, $3, true)
       returning id`,
      [`${TAG} Organizador`, ORGANIZER_EMAIL, senhaHash],
    );

    const nomes = [];
    const emails = [];
    for (let i = 1; i <= PARTICIPANTES; i++) {
      nomes.push(`${TAG} Participante ${String(i).padStart(4, '0')}`);
      emails.push(`carga-${i}@${EMAIL_DOMAIN}`);
    }

    const { rows: usuarios } = await pool.query(
      `insert into usuario (nome, email, senha, is_active)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::bool[])
       returning id`,
      [nomes, emails, nomes.map(() => senhaHash), nomes.map(() => true)],
    );

    const inicio = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const fim = new Date(Date.now() - 27 * 24 * 3600 * 1000);

    const { rows: [evento] } = await pool.query(
      `insert into evento
         (nome, codigo, descricao, localizacao, responsavel, "cargaHoraria",
          "dataInicio", "dataFim", status,
          assinante1_nome, assinante1_titulo, assinante2_nome, assinante2_titulo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'finalizada', $9, $10, $11, $12)
       returning id`,
      [
        `[${TAG}] Congresso de Carga`,
        TAG,
        'Evento sintético usado apenas em teste de carga.',
        'Feira de Santana - BA',
        `${TAG} Organizador`,
        40,
        inicio,
        fim,
        'Prof. Dra. Fulana de Tal',
        'Reitora',
        'Prof. Dr. Beltrano de Tal',
        'Coordenador de Extensão',
      ],
    );

    const participantesIds = [organizador.id, ...usuarios.map((u) => u.id)];
    const tipos = participantesIds.map((_, i) => (i === 0 ? 'organizador' : tipoParticipacao(i)));

    const { rows: participacoes } = await pool.query(
      `insert into participacao (tipo, usuario_id, evento_id)
       select tipo::tipo_participante, usuario_id, $3
       from unnest($1::text[], $2::int[]) as t(tipo, usuario_id)
       returning id`,
      [tipos, participantesIds, evento.id],
    );

    const { rows: [atividade] } = await pool.query(
      `insert into atividade
         (nome, descricao, localizacao, "dataInicio", "dataFim", categoria,
          "cargaHoraria", status, evento_id)
       values ($1, $2, $3, $4, $5, 'palestra', $6, 'finalizada', $7)
       returning id`,
      [
        `[${TAG}] Palestra de Abertura`,
        'Atividade sintética de teste de carga.',
        'Auditório Central',
        inicio,
        fim,
        4,
        evento.id,
      ],
    );

    // Sem presença registrada, quem é 'participante' não entra na emissão
    // (findParticipacoesByEvent exige presente = true para esse tipo).
    await pool.query(
      `insert into participacoes_atividades (participacao_id, atividade_id, presente, data_presenca)
       select participacao_id, $2, true, $3
       from unnest($1::int[]) as t(participacao_id)`,
      [participacoes.map((p) => p.id), atividade.id, fim],
    );

    const nomesConvidados = [];
    const emailsConvidados = [];
    for (let i = 1; i <= CONVIDADOS; i++) {
      nomesConvidados.push(`${TAG} Convidado ${String(i).padStart(3, '0')}`);
      emailsConvidados.push(`convidado-${i}@${EMAIL_DOMAIN}`);
    }

    const { rows: convidados } = await pool.query(
      `insert into convidado (nome, email)
       select * from unnest($1::text[], $2::text[])
       returning id`,
      [nomesConvidados, emailsConvidados],
    );

    await pool.query(
      `insert into convidado_atividade (funcao, convidado_id, atividade_id)
       select funcao::funcao_convidado, convidado_id, $3
       from unnest($1::text[], $2::int[]) as t(funcao, convidado_id)`,
      [
        convidados.map((_, i) => FUNCOES_CONVIDADO[i % FUNCOES_CONVIDADO.length]),
        convidados.map((c) => c.id),
        atividade.id,
      ],
    );

    console.log(
      JSON.stringify(
        {
          eventoId: evento.id,
          atividadeId: atividade.id,
          organizadorId: organizador.id,
          organizadorEmail: ORGANIZER_EMAIL,
          participantes: participantesIds.length,
          convidados: convidados.length,
          duracaoMs: Date.now() - t0,
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
  console.error('seed falhou:', e.message);
  process.exit(1);
});
