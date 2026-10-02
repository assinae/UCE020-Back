import { Injectable } from '@nestjs/common';
import { db } from 'src/db';
import {
  tabelaAtividade,
  tabelaEvento,
  tabelaParticipacoes,
  tabelaParticipacoesAtividades,
  tabelaRegistroCheckinAtividade,
} from 'src/db/schema';
import { and, eq } from 'drizzle-orm';
import { tabelaUsuario } from 'src/db/schema';

@Injectable()
export class ParticipationRepository {
  //Retorna a participação do usuário em um evento específico, se existir
  async findSubscription(usuarioId: number, eventoId: number) {
    const [participacao] = await db
      .select()
      .from(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.usuarioId, usuarioId),
          eq(tabelaParticipacoes.eventoId, eventoId),
        ),
      )
      .limit(1);
    return participacao ?? null;
  }

  async findEventoById(eventoId: number) {
    const [evento] = await db
      .select()
      .from(tabelaEvento)
      .where(eq(tabelaEvento.id, eventoId))
      .limit(1);
    return evento ?? null;
  }

  async findAtividadeById(atividadeId: number) {
    const [atividade] = await db
      .select()
      .from(tabelaAtividade)
      .where(eq(tabelaAtividade.id, atividadeId))
      .limit(1);
    return atividade ?? null;
  }

  async findParticipacaoAtividade(participacaoId: number, atividadeId: number) {
    const [participacaoAtividade] = await db
      .select()
      .from(tabelaParticipacoesAtividades)
      .where(
        and(
          eq(tabelaParticipacoesAtividades.participacaoId, participacaoId),
          eq(tabelaParticipacoesAtividades.atividadeId, atividadeId),
        ),
      )
      .limit(1);
    return participacaoAtividade ?? null;
  }

  async findParticipantsByActivity(atividadeId: number) {
    const rows = await db
      .select({
        participacaoId: tabelaParticipacoesAtividades.participacaoId,
        atividadeId: tabelaParticipacoesAtividades.atividadeId,
        presente: tabelaParticipacoesAtividades.presente,
        dataPresenca: tabelaParticipacoesAtividades.dataPresenca,
        usuarioId: tabelaParticipacoes.usuarioId,
        tipo: tabelaParticipacoes.tipo,
        nome: tabelaUsuario.nome,
        email: tabelaUsuario.email,
      })
      .from(tabelaParticipacoesAtividades)
      .innerJoin(
        tabelaParticipacoes,
        eq(tabelaParticipacoesAtividades.participacaoId, tabelaParticipacoes.id),
      )
      .innerJoin(
        tabelaUsuario,
        eq(tabelaParticipacoes.usuarioId, tabelaUsuario.id),
      )
      .where(eq(tabelaParticipacoesAtividades.atividadeId, atividadeId));

    return rows;
  }

  async markActivityAttendance(
    participacaoId: number,
    atividadeId: number,
    autorUsuarioId: number,
    dataPresenca: Date,
  ) {
    return db.transaction(async (tx) => {
      const [participacaoAtividade] = await tx
        .update(tabelaParticipacoesAtividades)
        .set({ presente: true, dataPresenca })
        .where(
          and(
            eq(tabelaParticipacoesAtividades.participacaoId, participacaoId),
            eq(tabelaParticipacoesAtividades.atividadeId, atividadeId),
            eq(tabelaParticipacoesAtividades.presente, false),
          ),
        )
        .returning();

      if (!participacaoAtividade) return null;

      await tx.insert(tabelaRegistroCheckinAtividade).values({
        participacaoId,
        atividadeId,
        acao: 'confirmacao',
        autorUsuarioId,
        realizadoEm: dataPresenca,
      });

      return participacaoAtividade;
    });
  }

  async removeActivityAttendance(
    participacaoId: number,
    atividadeId: number,
    autorUsuarioId: number,
    realizadoEm: Date,
  ) {
    return db.transaction(async (tx) => {
      const [participacaoAtividade] = await tx
        .update(tabelaParticipacoesAtividades)
        .set({ presente: false, dataPresenca: null })
        .where(
          and(
            eq(tabelaParticipacoesAtividades.participacaoId, participacaoId),
            eq(tabelaParticipacoesAtividades.atividadeId, atividadeId),
            eq(tabelaParticipacoesAtividades.presente, true),
          ),
        )
        .returning();

      if (!participacaoAtividade) return null;

      await tx.insert(tabelaRegistroCheckinAtividade).values({
        participacaoId,
        atividadeId,
        acao: 'exclusao',
        autorUsuarioId,
        realizadoEm,
      });

      return participacaoAtividade;
    });
  }

  async findConfirmedAttendancesForEvent(usuarioId: number, eventoId: number) {
    const rows = await db
      .select({
        participacaoId: tabelaParticipacoesAtividades.participacaoId,
      })
      .from(tabelaParticipacoesAtividades)
      .innerJoin(
        tabelaParticipacoes,
        eq(tabelaParticipacoesAtividades.participacaoId, tabelaParticipacoes.id),
      )
      .where(
        and(
          eq(tabelaParticipacoes.usuarioId, usuarioId),
          eq(tabelaParticipacoes.eventoId, eventoId),
          eq(tabelaParticipacoesAtividades.presente, true),
        ),
      );

    return rows;
  }

  async subscribe(usuarioId: number, eventoId: number) {
    const [participacao] = await db
      .insert(tabelaParticipacoes)
      .values({
        usuarioId,
        eventoId,
        tipo: 'participante',
      })
      .returning();
    return participacao;
  }

  async unsubscribe(usuarioId: number, eventoId: number) {
    await db
      .delete(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.usuarioId, usuarioId),
          eq(tabelaParticipacoes.eventoId, eventoId),
        ),
      );
  }
}
