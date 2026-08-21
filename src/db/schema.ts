import { relations } from 'drizzle-orm';
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
} from 'drizzle-orm/pg-core';

//Criação das Tabelas no Banco de Dados utilizando Drizzle ORM

//Enuns
export const funcaoConvidadoEnum = pgEnum('funcao_convidado', [
  'palestrante',
  'ministrante',
  'moderador',
]);
export const categoriaAtividadeEnum = pgEnum('categoria_atividade', [
  'curso',
  'minicurso',
  'palestra',
  'oficina',
  'mesa_redonda',
  'outro',
]);
export const statusEnum = pgEnum('status', [
  'pendente',
  'iniciada',
  'andamento',
  'finalizada',
]);
export const tipoParticipanteEnum = pgEnum('tipo_participante', [
  'participante',
  'organizador',
  'monitor',
]);

//Tabelas

//Tabela de usuários
export const tabelaUsuario = pgTable('usuario', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  senha: text('senha').notNull(),
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').notNull().default(false),
  resetPasswordToken: text('reset_password_token'),
  resetPasswordExpires: timestamp('reset_password_expires'),
  verificationCode: text('verification_code'),
  codeExpiresAt: timestamp('code_expires_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date()),
});

//Tabela de eventos
export const tabelaEvento = pgTable('evento', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar({ length: 255 }).notNull(),
  codigo: varchar({ length: 50 }),
  descricao: text('descricao').notNull(),
  localizacao: text('localizacao').notNull(),
  responsavel: text('responsavel').notNull(),
  cargaHoraria: integer('cargaHoraria').notNull(),
  dataInicio: timestamp('dataInicio').notNull(),
  dataFim: timestamp('dataFim').notNull(),
  status: statusEnum('status').notNull(),
  foto: text('foto'), //url
  assinante1Nome: text('assinante1_nome'),
  assinante1Titulo: text('assinante1_titulo'),
  assinante2Nome: text('assinante2_nome'),
  assinante2Titulo: text('assinante2_titulo'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date()),
});

//Tabela de convidados da atividade
export const tabelaConvidado = pgTable('convidado', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
});

//Tabela de atividade
export const tabelaAtividade = pgTable('atividade', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar({ length: 255 }).notNull(),
  descricao: text('descricao').notNull(),
  localizacao: text('localizacao').notNull(),
  dataInicio: timestamp('dataInicio').notNull(),
  dataFim: timestamp('dataFim').notNull(),
  categoria: categoriaAtividadeEnum('categoria').notNull(),
  cargaHoraria: integer('cargaHoraria').notNull(),
  status: statusEnum('status').notNull(),
  foto: text('foto'), //url
  //Uma atividade pertence a um evento
  eventoId: integer('evento_id')
    .notNull()
    .references(() => tabelaEvento.id, { onDelete: 'cascade' }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date()),
});

//Tabela de participacoes do evento
//Uma participacao é feita por um usuário em um evento
export const tabelaParticipacoes = pgTable('participacao', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tipo: tipoParticipanteEnum('tipo').notNull(), //pode ser somente um participante, organizador ou monitor
  //Um participante é um usuário
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => tabelaUsuario.id, { onDelete: 'cascade' }),
  //Um participante participa de um evento
  eventoId: integer('evento_id')
    .notNull()
    .references(() => tabelaEvento.id, { onDelete: 'cascade' }),
});

//Tabela de participacoes e atividades
export const tabelaParticipacoesAtividades = pgTable(
  'participacoes_atividades',
  {
    participacaoId: integer('participacao_id')
      .notNull()
      .references(() => tabelaParticipacoes.id, { onDelete: 'cascade' }),
    atividadeId: integer('atividade_id')
      .notNull()
      .references(() => tabelaAtividade.id, { onDelete: 'cascade' }),
    presente: boolean('presente').notNull().default(false),
    dataPresenca: timestamp('data_presenca'),
  },
);

//Tabela de certificado dos participantes
export const tabelaCertificadoEvento = pgTable('certificado_evento', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => tabelaUsuario.id, { onDelete: 'cascade' }),
  eventoId: integer('evento_id')
    .notNull()
    .references(() => tabelaEvento.id, { onDelete: 'cascade' }),
  dataEmissao: timestamp('dataEmissao').notNull(),
  arquivoPdf: text('arquivo_pdf'), //url do arquivo PDF gerado
  // --- Assinatura digital (lógica + carimbo/hash) ---
  assinado: boolean('assinado').notNull().default(false),
  assinadoEm: timestamp('assinado_em'),
  assinadoPor: integer('assinado_por').references(() => tabelaUsuario.id, {
    onDelete: 'set null',
  }),
  assinaturaNome: text('assinatura_nome'), //nome do assinante estampado no PDF
  codigoVerificacao: text('codigo_verificacao'), //código público usado na verificação
  hashVerificacao: text('hash_verificacao'), //hash de integridade do documento assinado
});

//Tabela de certificado dos participantes
export const tabelaCertificadoAtividade = pgTable('certificado_atividade', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => tabelaUsuario.id, { onDelete: 'cascade' }),
  atividadeId: integer('atividade_id')
    .notNull()
    .references(() => tabelaAtividade.id, { onDelete: 'cascade' }),
  dataEmissao: timestamp('dataEmissao').notNull(),
  arquivoPdf: text('arquivo_pdf'), //url do arquivo PDF gerado
  // --- Assinatura digital (lógica + carimbo/hash) ---
  assinado: boolean('assinado').notNull().default(false),
  assinadoEm: timestamp('assinado_em'),
  assinadoPor: integer('assinado_por').references(() => tabelaUsuario.id, {
    onDelete: 'set null',
  }),
  assinaturaNome: text('assinatura_nome'),
  codigoVerificacao: text('codigo_verificacao'),
  hashVerificacao: text('hash_verificacao'),
});

//Tabela de certificado dos convidados (palestrante/ministrante/moderador de uma atividade)
export const tabelaCertificadoConvidado = pgTable('certificado_convidado', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  convidadoId: integer('convidado_id')
    .notNull()
    .references(() => tabelaConvidado.id, { onDelete: 'cascade' }),
  atividadeId: integer('atividade_id')
    .notNull()
    .references(() => tabelaAtividade.id, { onDelete: 'cascade' }),
  dataEmissao: timestamp('dataEmissao').notNull(),
  arquivoPdf: text('arquivo_pdf'), //url do arquivo PDF gerado
  // --- Assinatura digital (lógica + carimbo/hash) ---
  assinado: boolean('assinado').notNull().default(false),
  assinadoEm: timestamp('assinado_em'),
  assinadoPor: integer('assinado_por').references(() => tabelaUsuario.id, {
    onDelete: 'set null',
  }),
  assinaturaNome: text('assinatura_nome'),
  codigoVerificacao: text('codigo_verificacao'),
  hashVerificacao: text('hash_verificacao'),
});

//Relações

//Relacionamento de usuário
export const tabelaUsuarioRelations = relations(tabelaUsuario, ({ many }) => ({
  //Um usuário tem muitos certificados de evento
  certificadosEvento: many(tabelaCertificadoEvento),
  //Um usuário tem muitos certificados de atividade
  certificadosAtividade: many(tabelaCertificadoAtividade),
  //Um usuário tem muitas participacoes em eventos
  participacoes: many(tabelaParticipacoes),
}));

//Relacionamento de evento
export const tabelaEventoRelations = relations(tabelaEvento, ({ many }) => ({
  //Um evento tem muitas participacoes
  participacoes: many(tabelaParticipacoes),
  //Um evento tem muitas atividades
  atividades: many(tabelaAtividade),
}));

//Relacionamento de atividade
export const tabelaAtividadeRelations = relations(
  tabelaAtividade,
  ({ many, one }) => ({
    //Uma atividade pertence a um evento
    evento: one(tabelaEvento, {
      fields: [tabelaAtividade.eventoId],
      references: [tabelaEvento.id],
    }),
    //Uma atividade tem muitos convidados
    convidados: many(tabelaConvidadoAtividade),
    //Uma atividade tem muitos participantes
    participacoes: many(tabelaParticipacoesAtividades),
    //Uma atividade tem muitos certificados de convidado
    certificadosConvidado: many(tabelaCertificadoConvidado),
  }),
);

//Relacionamento de participante
export const tabelaParticipanteRelations = relations(
  tabelaParticipacoes,
  ({ many, one }) => ({
    //Um participante é um usuário
    usuario: one(tabelaUsuario, {
      fields: [tabelaParticipacoes.usuarioId],
      references: [tabelaUsuario.id],
    }),
    //Um participante participa de um evento
    evento: one(tabelaEvento, {
      fields: [tabelaParticipacoes.eventoId],
      references: [tabelaEvento.id],
    }),
    //Um participante tem muitas atividades
    atividades: many(tabelaParticipacoesAtividades),
  }),
);

//Relacionamento de participacao e atividade
export const tabelaParticipacaoAtividadeRelations = relations(
  tabelaParticipacoesAtividades,
  ({ one }) => ({
    participacao: one(tabelaParticipacoes, {
      fields: [tabelaParticipacoesAtividades.participacaoId],
      references: [tabelaParticipacoes.id],
    }),
    atividade: one(tabelaAtividade, {
      fields: [tabelaParticipacoesAtividades.atividadeId],
      references: [tabelaAtividade.id],
    }),
  }),
);

export const tabelaConvidadoAtividade = pgTable('convidado_atividade', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  funcao: funcaoConvidadoEnum('funcao').notNull(),
  convidadoId: integer('convidado_id')
    .notNull()
    .references(() => tabelaConvidado.id, { onDelete: 'cascade' }),
  atividadeId: integer('atividade_id')
    .notNull()
    .references(() => tabelaAtividade.id, { onDelete: 'cascade' }),
});

//Relacionamento de convidado
export const tabelaConvidadoRelations = relations(
  tabelaConvidado,
  ({ many }) => ({
    atividades: many(tabelaConvidadoAtividade),
    certificados: many(tabelaCertificadoConvidado),
  }),
);

// Pivot — um vínculo pertence a um convidado e a uma atividade
export const tabelaConvidadoAtividadeRelations = relations(
  tabelaConvidadoAtividade,
  ({ one }) => ({
    convidado: one(tabelaConvidado, {
      fields: [tabelaConvidadoAtividade.convidadoId],
      references: [tabelaConvidado.id],
    }),
    atividade: one(tabelaAtividade, {
      fields: [tabelaConvidadoAtividade.atividadeId],
      references: [tabelaAtividade.id],
    }),
  }),
);

//Relacionamento de certificado evento
export const tabelaCertificadoEventoRelations = relations(
  tabelaCertificadoEvento,
  ({ one }) => ({
    //Um certificado pertence a um usuário
    usuario: one(tabelaUsuario, {
      fields: [tabelaCertificadoEvento.usuarioId],
      references: [tabelaUsuario.id],
    }),
    //Um certificado pertence a um evento
    evento: one(tabelaEvento, {
      fields: [tabelaCertificadoEvento.eventoId],
      references: [tabelaEvento.id],
    }),
  }),
);

//Relacionamento de certificado atividade
export const tabelaCertificadoAtividadeRelations = relations(
  tabelaCertificadoAtividade,
  ({ one }) => ({
    //Um certificado pertence a um usuário
    usuario: one(tabelaUsuario, {
      fields: [tabelaCertificadoAtividade.usuarioId],
      references: [tabelaUsuario.id],
    }),
    //Um certificado pertence a uma atividade
    atividade: one(tabelaAtividade, {
      fields: [tabelaCertificadoAtividade.atividadeId],
      references: [tabelaAtividade.id],
    }),
  }),
);

//Relacionamento de certificado convidado
export const tabelaCertificadoConvidadoRelations = relations(
  tabelaCertificadoConvidado,
  ({ one }) => ({
    //Um certificado pertence a um convidado
    convidado: one(tabelaConvidado, {
      fields: [tabelaCertificadoConvidado.convidadoId],
      references: [tabelaConvidado.id],
    }),
    //Um certificado pertence a uma atividade
    atividade: one(tabelaAtividade, {
      fields: [tabelaCertificadoConvidado.atividadeId],
      references: [tabelaAtividade.id],
    }),
  }),
);
