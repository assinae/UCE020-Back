// src/modules/certificate/repository/certificate.repository.ts
import { Injectable } from '@nestjs/common';
import { db } from 'src/db';
import {
  tabelaCertificadoEvento,
  tabelaCertificadoAtividade,
  tabelaCertificadoConvidado,
  tabelaParticipacoes,
  tabelaUsuario,
  tabelaAtividade,
  tabelaConvidado,
  tabelaConvidadoAtividade,
  tabelaEvento,
  tabelaParticipacoesAtividades,
} from 'src/db/schema';
import { and, eq, or, sql, SQL } from 'drizzle-orm';

export interface EventoCertParaAssinar {
  id: number;
  arquivoPdf: string | null;
  dataEmissao: Date;
  participantName: string;
  role: string;
  eventName: string;
  workloadHours: number | null;
  location: string;
  dataInicio: Date;
  dataFim: Date;
}

export interface ConvidadoCertParaAssinar {
  id: number;
  arquivoPdf: string | null;
  dataEmissao: Date;
  guestName: string;
  role: string;
  eventName: string;
  activityName: string;
  workloadHours: number | null;
  location: string;
  dataInicio: Date;
  dataFim: Date;
}

export interface DadosAssinatura {
  assinadoEm: Date;
  assinadoPor: number;
  assinaturaNome: string;
  codigoVerificacao: string;
  hashVerificacao: string;
}

export interface CertificadoVerificado {
  tipo: 'evento' | 'atividade' | 'convidado';
  titular: string;
  contexto: string; // nome do evento ou atividade
  dataEmissao: Date;
  assinadoEm: Date | null;
  assinaturaNome: string | null;
  hashVerificacao: string | null;
}

/**
 * Dados completos para re-renderizar o PDF de um certificado de participante.
 * usuarioId/eventoId voltam junto porque a autorização do download depende
 * deles (dono do certificado ou organizador do evento).
 */
export interface EventoCertParaRender {
  id: number;
  usuarioId: number;
  eventoId: number;
  dataEmissao: Date;
  participantName: string;
  role: string;
  eventName: string;
  workloadHours: number | null;
  location: string;
  dataInicio: Date;
  dataFim: Date;
  assinante1Nome: string | null;
  assinante1Titulo: string | null;
  assinante2Nome: string | null;
  assinante2Titulo: string | null;
  assinado: boolean;
  assinadoEm: Date | null;
  assinaturaNome: string | null;
  codigoVerificacao: string | null;
}

/** Idem, para certificado de convidado (ligado a uma atividade). */
export interface ConvidadoCertParaRender {
  id: number;
  eventoId: number;
  dataEmissao: Date;
  guestName: string;
  role: string;
  eventName: string;
  activityName: string;
  workloadHours: number | null;
  location: string;
  dataInicio: Date;
  dataFim: Date;
  assinante1Nome: string | null;
  assinante1Titulo: string | null;
  assinante2Nome: string | null;
  assinante2Titulo: string | null;
  assinado: boolean;
  assinadoEm: Date | null;
  assinaturaNome: string | null;
  codigoVerificacao: string | null;
}
@Injectable()
export class CertificateRepository {
  private userCertificateQuery(condition: SQL) {
    return db
      .select({
        id: tabelaCertificadoEvento.id,
        dataEmissao: tabelaCertificadoEvento.dataEmissao,
        participantName: tabelaUsuario.nome,
        participantEmail: tabelaUsuario.email,
        role: tabelaParticipacoes.tipo,
        location: tabelaEvento.localizacao,
        activityTitle: tabelaEvento.nome,
        activityHours: tabelaEvento.cargaHoraria,
        arquivoPdf: tabelaCertificadoEvento.arquivoPdf,
      })
      .from(tabelaCertificadoEvento)
      .innerJoin(
        tabelaUsuario,
        eq(tabelaCertificadoEvento.usuarioId, tabelaUsuario.id),
      )
      .innerJoin(
        tabelaEvento,
        eq(tabelaCertificadoEvento.eventoId, tabelaEvento.id),
      )
      .innerJoin(
        tabelaParticipacoes,
        and(
          eq(tabelaParticipacoes.usuarioId, tabelaCertificadoEvento.usuarioId),
          eq(tabelaParticipacoes.eventoId, tabelaCertificadoEvento.eventoId),
        ),
      )
      .where(condition);
  }

  private guestCertificateQuery(condition: SQL) {
    return db
      .select({
        id: tabelaCertificadoConvidado.id,
        dataEmissao: tabelaCertificadoConvidado.dataEmissao,
        participantName: tabelaConvidado.nome,
        participantEmail: tabelaConvidado.email,
        role: tabelaConvidadoAtividade.funcao,
        location: tabelaAtividade.localizacao,
        activityTitle: tabelaAtividade.nome,
        activityHours: tabelaAtividade.cargaHoraria,
        arquivoPdf: tabelaCertificadoConvidado.arquivoPdf,
      })
      .from(tabelaCertificadoConvidado)
      .innerJoin(
        tabelaConvidado,
        eq(tabelaCertificadoConvidado.convidadoId, tabelaConvidado.id),
      )
      .innerJoin(
        tabelaAtividade,
        eq(tabelaCertificadoConvidado.atividadeId, tabelaAtividade.id),
      )
      .innerJoin(
        tabelaConvidadoAtividade,
        and(
          eq(
            tabelaConvidadoAtividade.convidadoId,
            tabelaCertificadoConvidado.convidadoId,
          ),
          eq(
            tabelaConvidadoAtividade.atividadeId,
            tabelaCertificadoConvidado.atividadeId,
          ),
        ),
      )
      .where(condition);
  }

  async findByEvent(eventoId: number, page: number, limit: number) {
    const [userRows, guestRows] = await Promise.all([
      this.userCertificateQuery(eq(tabelaCertificadoEvento.eventoId, eventoId)),
      this.guestCertificateQuery(eq(tabelaAtividade.eventoId, eventoId)),
    ]);

    const offset = (page - 1) * limit;
    return [...userRows, ...guestRows]
      .sort((a, b) => b.dataEmissao.getTime() - a.dataEmissao.getTime())
      .slice(offset, offset + limit);
  }

  async findByUser(usuarioId: number, page: number, limit: number) {
    const rows = await this.userCertificateQuery(
      eq(tabelaCertificadoEvento.usuarioId, usuarioId),
    );

    const offset = (page - 1) * limit;
    return rows
      .sort((a, b) => b.dataEmissao.getTime() - a.dataEmissao.getTime())
      .slice(offset, offset + limit);
  }

  async findUserCertificateById(certificateId: number) {
    const [row] = await this.userCertificateQuery(
      eq(tabelaCertificadoEvento.id, certificateId),
    );
    return row;
  }

  async findGuestCertificateById(certificateId: number) {
    const [row] = await this.guestCertificateQuery(
      eq(tabelaCertificadoConvidado.id, certificateId),
    );
    return row;
  }

  async countByEvent(eventoId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tabelaCertificadoEvento)
      .where(eq(tabelaCertificadoEvento.eventoId, eventoId));
    return result[0]?.count ?? 0;
  }

  async countByRole(
    eventoId: number,
  ): Promise<{ role: string; count: number }[]> {
    return db
      .select({
        role: tabelaParticipacoes.tipo,
        count: sql<number>`count(distinct ${tabelaCertificadoEvento.id})::int`,
      })
      .from(tabelaCertificadoEvento)
      .innerJoin(
        tabelaParticipacoes,
        and(
          eq(tabelaParticipacoes.usuarioId, tabelaCertificadoEvento.usuarioId),
          eq(tabelaParticipacoes.eventoId, tabelaCertificadoEvento.eventoId),
        ),
      )
      .where(eq(tabelaCertificadoEvento.eventoId, eventoId))
      .groupBy(tabelaParticipacoes.tipo);
  }

  async countGuestCertificatesByEvent(eventoId: number): Promise<number> {
    const result = await db
      .select({
        count: sql<number>`count(distinct ${tabelaCertificadoConvidado.id})::int`,
      })
      .from(tabelaCertificadoConvidado)
      .innerJoin(
        tabelaAtividade,
        eq(tabelaCertificadoConvidado.atividadeId, tabelaAtividade.id),
      )
      .where(eq(tabelaAtividade.eventoId, eventoId));
    return result[0]?.count ?? 0;
  }

  async findActivityForCertificate(atividadeId: number) {
    const [atividade] = await db
      .select({
        id: tabelaAtividade.id,
        nome: tabelaAtividade.nome,
        cargaHoraria: tabelaAtividade.cargaHoraria,
        status: tabelaAtividade.status,
        localizacao: tabelaAtividade.localizacao,
        dataInicio: tabelaAtividade.dataInicio,
        dataFim: tabelaAtividade.dataFim,
        eventoId: tabelaAtividade.eventoId,
        eventoNome: tabelaEvento.nome,
        assinante1Nome: tabelaEvento.assinante1Nome,
        assinante1Titulo: tabelaEvento.assinante1Titulo,
        assinante2Nome: tabelaEvento.assinante2Nome,
        assinante2Titulo: tabelaEvento.assinante2Titulo,
      })
      .from(tabelaAtividade)
      .innerJoin(tabelaEvento, eq(tabelaAtividade.eventoId, tabelaEvento.id))
      .where(eq(tabelaAtividade.id, atividadeId));
    return atividade;
  }

  async findGuestsByActivity(atividadeId: number) {
    return db
      .select({
        convidadoId: tabelaConvidado.id,
        nome: tabelaConvidado.nome,
        email: tabelaConvidado.email,
        funcao: tabelaConvidadoAtividade.funcao,
      })
      .from(tabelaConvidadoAtividade)
      .innerJoin(
        tabelaConvidado,
        eq(tabelaConvidadoAtividade.convidadoId, tabelaConvidado.id),
      )
      .where(eq(tabelaConvidadoAtividade.atividadeId, atividadeId));
  }

  async findExistingGuestCertificatesByActivity(atividadeId: number) {
    return db
      .select()
      .from(tabelaCertificadoConvidado)
      .where(eq(tabelaCertificadoConvidado.atividadeId, atividadeId));
  }

  async insertGuestCertificates(
    rows: { convidadoId: number; atividadeId: number; dataEmissao: Date }[],
  ) {
    if (!rows.length) return [];
    return db.insert(tabelaCertificadoConvidado).values(rows).returning();
  }

  async setGuestCertificateFile(certificateId: number, arquivoPdf: string) {
    await db
      .update(tabelaCertificadoConvidado)
      .set({ arquivoPdf })
      .where(eq(tabelaCertificadoConvidado.id, certificateId));
  }

  async findEventForCertificate(eventoId: number) {
    const [evento] = await db
      .select({
        id: tabelaEvento.id,
        nome: tabelaEvento.nome,
        cargaHoraria: tabelaEvento.cargaHoraria,
        status: tabelaEvento.status,
        localizacao: tabelaEvento.localizacao,
        dataInicio: tabelaEvento.dataInicio,
        dataFim: tabelaEvento.dataFim,
        assinante1Nome: tabelaEvento.assinante1Nome,
        assinante1Titulo: tabelaEvento.assinante1Titulo,
        assinante2Nome: tabelaEvento.assinante2Nome,
        assinante2Titulo: tabelaEvento.assinante2Titulo,
      })
      .from(tabelaEvento)
      .where(eq(tabelaEvento.id, eventoId));
    return evento;
  }

  async findParticipacoesByEvent(eventoId: number) {
    return db
      .select({
        usuarioId: tabelaUsuario.id,
        nome: tabelaUsuario.nome,
        email: tabelaUsuario.email,
        tipo: tabelaParticipacoes.tipo,
      })
      .from(tabelaParticipacoes)
      .innerJoin(
        tabelaUsuario,
        eq(tabelaParticipacoes.usuarioId, tabelaUsuario.id),
      )
      .leftJoin(
        tabelaParticipacoesAtividades,
        eq(
          tabelaParticipacoes.id,
          tabelaParticipacoesAtividades.participacaoId,
        ),
      )
      .where(
        and(
          eq(tabelaParticipacoes.eventoId, eventoId),
          or(
            and(
              eq(tabelaParticipacoes.tipo, 'participante'),
              eq(tabelaParticipacoesAtividades.presente, true),
            ),
            eq(tabelaParticipacoes.tipo, 'organizador'),
            eq(tabelaParticipacoes.tipo, 'monitor'),
          ),
        ),
      )
      .groupBy(
        tabelaUsuario.id,
        tabelaUsuario.nome,
        tabelaUsuario.email,
        tabelaParticipacoes.tipo,
      );
  }

  async findExistingUserCertificatesByEvent(eventoId: number) {
    return db
      .select()
      .from(tabelaCertificadoEvento)
      .where(eq(tabelaCertificadoEvento.eventoId, eventoId));
  }

  async insertUserCertificates(
    rows: { usuarioId: number; eventoId: number; dataEmissao: Date }[],
  ) {
    if (!rows.length) return [];
    return db.insert(tabelaCertificadoEvento).values(rows).returning();
  }

  async setUserCertificateFile(certificateId: number, arquivoPdf: string) {
    await db
      .update(tabelaCertificadoEvento)
      .set({ arquivoPdf })
      .where(eq(tabelaCertificadoEvento.id, certificateId));
  }

  // ======================================================================
  // Assinatura digital (lógica + carimbo/hash)
  // ======================================================================

  async findUsuarioNome(usuarioId: number): Promise<string | null> {
    const [row] = await db
      .select({ nome: tabelaUsuario.nome })
      .from(tabelaUsuario)
      .where(eq(tabelaUsuario.id, usuarioId));
    return row?.nome ?? null;
  }

  /**
   * Certificados de participante do evento para assinar, com os dados
   * completos necessários para re-renderizar o PDF com a assinatura.
   * @param incluirAssinados quando true, traz também os já assinados (reassinatura).
   */
  async findEventCertificatesToSign(
    eventoId: number,
    incluirAssinados = false,
  ): Promise<EventoCertParaAssinar[]> {
    const cond = incluirAssinados
      ? eq(tabelaCertificadoEvento.eventoId, eventoId)
      : and(
          eq(tabelaCertificadoEvento.eventoId, eventoId),
          eq(tabelaCertificadoEvento.assinado, false),
        );
    return db
      .select({
        id: tabelaCertificadoEvento.id,
        arquivoPdf: tabelaCertificadoEvento.arquivoPdf,
        dataEmissao: tabelaCertificadoEvento.dataEmissao,
        participantName: tabelaUsuario.nome,
        role: tabelaParticipacoes.tipo,
        eventName: tabelaEvento.nome,
        workloadHours: tabelaEvento.cargaHoraria,
        location: tabelaEvento.localizacao,
        dataInicio: tabelaEvento.dataInicio,
        dataFim: tabelaEvento.dataFim,
      })
      .from(tabelaCertificadoEvento)
      .innerJoin(
        tabelaUsuario,
        eq(tabelaCertificadoEvento.usuarioId, tabelaUsuario.id),
      )
      .innerJoin(
        tabelaEvento,
        eq(tabelaCertificadoEvento.eventoId, tabelaEvento.id),
      )
      .innerJoin(
        tabelaParticipacoes,
        and(
          eq(tabelaParticipacoes.usuarioId, tabelaCertificadoEvento.usuarioId),
          eq(tabelaParticipacoes.eventoId, tabelaCertificadoEvento.eventoId),
        ),
      )
      .where(cond);
  }

  /**
   * Certificados de convidado (das atividades do evento) para assinar,
   * com dados completos para re-renderizar o PDF com a assinatura.
   */
  async findGuestCertificatesToSign(
    eventoId: number,
    incluirAssinados = false,
  ): Promise<ConvidadoCertParaAssinar[]> {
    const cond = incluirAssinados
      ? eq(tabelaAtividade.eventoId, eventoId)
      : and(
          eq(tabelaAtividade.eventoId, eventoId),
          eq(tabelaCertificadoConvidado.assinado, false),
        );
    return db
      .select({
        id: tabelaCertificadoConvidado.id,
        arquivoPdf: tabelaCertificadoConvidado.arquivoPdf,
        dataEmissao: tabelaCertificadoConvidado.dataEmissao,
        guestName: tabelaConvidado.nome,
        role: tabelaConvidadoAtividade.funcao,
        eventName: tabelaEvento.nome,
        activityName: tabelaAtividade.nome,
        workloadHours: tabelaAtividade.cargaHoraria,
        location: tabelaAtividade.localizacao,
        dataInicio: tabelaAtividade.dataInicio,
        dataFim: tabelaAtividade.dataFim,
      })
      .from(tabelaCertificadoConvidado)
      .innerJoin(
        tabelaAtividade,
        eq(tabelaCertificadoConvidado.atividadeId, tabelaAtividade.id),
      )
      .innerJoin(tabelaEvento, eq(tabelaAtividade.eventoId, tabelaEvento.id))
      .innerJoin(
        tabelaConvidado,
        eq(tabelaCertificadoConvidado.convidadoId, tabelaConvidado.id),
      )
      .innerJoin(
        tabelaConvidadoAtividade,
        and(
          eq(
            tabelaConvidadoAtividade.convidadoId,
            tabelaCertificadoConvidado.convidadoId,
          ),
          eq(
            tabelaConvidadoAtividade.atividadeId,
            tabelaCertificadoConvidado.atividadeId,
          ),
        ),
      )
      .where(cond);
  }

  async setEventCertificateSignature(id: number, dados: DadosAssinatura) {
    await db
      .update(tabelaCertificadoEvento)
      .set({ assinado: true, ...dados })
      .where(eq(tabelaCertificadoEvento.id, id));
  }

  async setActivityCertificateSignature(id: number, dados: DadosAssinatura) {
    await db
      .update(tabelaCertificadoAtividade)
      .set({ assinado: true, ...dados })
      .where(eq(tabelaCertificadoAtividade.id, id));
  }

  async setGuestCertificateSignature(id: number, dados: DadosAssinatura) {
    await db
      .update(tabelaCertificadoConvidado)
      .set({ assinado: true, ...dados })
      .where(eq(tabelaCertificadoConvidado.id, id));
  }

  private readonly resetFields = {
    assinado: false,
    assinadoEm: null,
    assinadoPor: null,
    assinaturaNome: null,
    codigoVerificacao: null,
    hashVerificacao: null,
  };

  /** Invalida a assinatura de um certificado de participante (usado na reemissão). */
  async resetUserCertificateSignature(id: number) {
    await db
      .update(tabelaCertificadoEvento)
      .set(this.resetFields)
      .where(eq(tabelaCertificadoEvento.id, id));
  }

  /** Invalida a assinatura de um certificado de convidado (usado na reemissão). */
  async resetGuestCertificateSignature(id: number) {
    await db
      .update(tabelaCertificadoConvidado)
      .set(this.resetFields)
      .where(eq(tabelaCertificadoConvidado.id, id));
  }

  /** Busca um certificado assinado pelo código público de verificação. */
  async findByVerificationCode(
    codigo: string,
  ): Promise<CertificadoVerificado | null> {
    const [evento] = await db
      .select({
        titular: tabelaUsuario.nome,
        contexto: tabelaEvento.nome,
        dataEmissao: tabelaCertificadoEvento.dataEmissao,
        assinadoEm: tabelaCertificadoEvento.assinadoEm,
        assinaturaNome: tabelaCertificadoEvento.assinaturaNome,
        hashVerificacao: tabelaCertificadoEvento.hashVerificacao,
      })
      .from(tabelaCertificadoEvento)
      .innerJoin(
        tabelaUsuario,
        eq(tabelaCertificadoEvento.usuarioId, tabelaUsuario.id),
      )
      .innerJoin(
        tabelaEvento,
        eq(tabelaCertificadoEvento.eventoId, tabelaEvento.id),
      )
      .where(eq(tabelaCertificadoEvento.codigoVerificacao, codigo));
    if (evento) return { tipo: 'evento', ...evento };

    const [atividade] = await db
      .select({
        titular: tabelaUsuario.nome,
        contexto: tabelaAtividade.nome,
        dataEmissao: tabelaCertificadoAtividade.dataEmissao,
        assinadoEm: tabelaCertificadoAtividade.assinadoEm,
        assinaturaNome: tabelaCertificadoAtividade.assinaturaNome,
        hashVerificacao: tabelaCertificadoAtividade.hashVerificacao,
      })
      .from(tabelaCertificadoAtividade)
      .innerJoin(
        tabelaUsuario,
        eq(tabelaCertificadoAtividade.usuarioId, tabelaUsuario.id),
      )
      .innerJoin(
        tabelaAtividade,
        eq(tabelaCertificadoAtividade.atividadeId, tabelaAtividade.id),
      )
      .where(eq(tabelaCertificadoAtividade.codigoVerificacao, codigo));
    if (atividade) return { tipo: 'atividade', ...atividade };

    const [convidado] = await db
      .select({
        titular: tabelaConvidado.nome,
        contexto: tabelaAtividade.nome,
        dataEmissao: tabelaCertificadoConvidado.dataEmissao,
        assinadoEm: tabelaCertificadoConvidado.assinadoEm,
        assinaturaNome: tabelaCertificadoConvidado.assinaturaNome,
        hashVerificacao: tabelaCertificadoConvidado.hashVerificacao,
      })
      .from(tabelaCertificadoConvidado)
      .innerJoin(
        tabelaConvidado,
        eq(tabelaCertificadoConvidado.convidadoId, tabelaConvidado.id),
      )
      .innerJoin(
        tabelaAtividade,
        eq(tabelaCertificadoConvidado.atividadeId, tabelaAtividade.id),
      )
      .where(eq(tabelaCertificadoConvidado.codigoVerificacao, codigo));
    if (convidado) return { tipo: 'convidado', ...convidado };

    return null;
  }

  /**
   * Dados completos de UM certificado de participante para render sob demanda.
   * Diferente de findEventCertificatesToSign, traz também os assinantes do
   * evento e o estado da assinatura — o PDF é montado inteiro a partir daqui,
   * sem depender de arquivo salvo.
   */
  async findEventCertificateForRender(
    certificateId: number,
  ): Promise<EventoCertParaRender | undefined> {
    const [row] = await db
      .select({
        id: tabelaCertificadoEvento.id,
        usuarioId: tabelaCertificadoEvento.usuarioId,
        eventoId: tabelaCertificadoEvento.eventoId,
        dataEmissao: tabelaCertificadoEvento.dataEmissao,
        participantName: tabelaUsuario.nome,
        role: tabelaParticipacoes.tipo,
        eventName: tabelaEvento.nome,
        workloadHours: tabelaEvento.cargaHoraria,
        location: tabelaEvento.localizacao,
        dataInicio: tabelaEvento.dataInicio,
        dataFim: tabelaEvento.dataFim,
        assinante1Nome: tabelaEvento.assinante1Nome,
        assinante1Titulo: tabelaEvento.assinante1Titulo,
        assinante2Nome: tabelaEvento.assinante2Nome,
        assinante2Titulo: tabelaEvento.assinante2Titulo,
        assinado: tabelaCertificadoEvento.assinado,
        assinadoEm: tabelaCertificadoEvento.assinadoEm,
        assinaturaNome: tabelaCertificadoEvento.assinaturaNome,
        codigoVerificacao: tabelaCertificadoEvento.codigoVerificacao,
      })
      .from(tabelaCertificadoEvento)
      .innerJoin(
        tabelaUsuario,
        eq(tabelaCertificadoEvento.usuarioId, tabelaUsuario.id),
      )
      .innerJoin(
        tabelaEvento,
        eq(tabelaCertificadoEvento.eventoId, tabelaEvento.id),
      )
      .innerJoin(
        tabelaParticipacoes,
        and(
          eq(tabelaParticipacoes.usuarioId, tabelaCertificadoEvento.usuarioId),
          eq(tabelaParticipacoes.eventoId, tabelaCertificadoEvento.eventoId),
        ),
      )
      .where(eq(tabelaCertificadoEvento.id, certificateId));

    return row;
  }

  /** Idem, para certificado de convidado. */
  async findGuestCertificateForRender(
    certificateId: number,
  ): Promise<ConvidadoCertParaRender | undefined> {
    const [row] = await db
      .select({
        id: tabelaCertificadoConvidado.id,
        eventoId: tabelaAtividade.eventoId,
        dataEmissao: tabelaCertificadoConvidado.dataEmissao,
        guestName: tabelaConvidado.nome,
        role: tabelaConvidadoAtividade.funcao,
        eventName: tabelaEvento.nome,
        activityName: tabelaAtividade.nome,
        workloadHours: tabelaAtividade.cargaHoraria,
        location: tabelaAtividade.localizacao,
        dataInicio: tabelaAtividade.dataInicio,
        dataFim: tabelaAtividade.dataFim,
        assinante1Nome: tabelaEvento.assinante1Nome,
        assinante1Titulo: tabelaEvento.assinante1Titulo,
        assinante2Nome: tabelaEvento.assinante2Nome,
        assinante2Titulo: tabelaEvento.assinante2Titulo,
        assinado: tabelaCertificadoConvidado.assinado,
        assinadoEm: tabelaCertificadoConvidado.assinadoEm,
        assinaturaNome: tabelaCertificadoConvidado.assinaturaNome,
        codigoVerificacao: tabelaCertificadoConvidado.codigoVerificacao,
      })
      .from(tabelaCertificadoConvidado)
      .innerJoin(
        tabelaAtividade,
        eq(tabelaCertificadoConvidado.atividadeId, tabelaAtividade.id),
      )
      .innerJoin(tabelaEvento, eq(tabelaAtividade.eventoId, tabelaEvento.id))
      .innerJoin(
        tabelaConvidado,
        eq(tabelaCertificadoConvidado.convidadoId, tabelaConvidado.id),
      )
      .innerJoin(
        tabelaConvidadoAtividade,
        and(
          eq(
            tabelaConvidadoAtividade.convidadoId,
            tabelaCertificadoConvidado.convidadoId,
          ),
          eq(
            tabelaConvidadoAtividade.atividadeId,
            tabelaCertificadoConvidado.atividadeId,
          ),
        ),
      )
      .where(eq(tabelaCertificadoConvidado.id, certificateId));

    return row;
  }

  /**
   * Diz de fato se o usuario e organizador do evento.
   *
   * Existe separado de assertEventOrganizer porque o helper tem um bug
   * conhecido: o adminCheck e um array (sempre truthy), entao o
   * ForbiddenException nunca dispara e ele nao bloqueia ninguem.
   */
  async isEventOrganizer(userId: number, eventoId: number): Promise<boolean> {
    const [row] = await db
      .select({ usuarioId: tabelaParticipacoes.usuarioId })
      .from(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.usuarioId, userId),
          eq(tabelaParticipacoes.eventoId, eventoId),
          eq(tabelaParticipacoes.tipo, 'organizador'),
        ),
      );

    return Boolean(row);
  }
}
