import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { db } from 'src/db';
import {
  tabelaAtividade,
  tabelaEvento,
  tabelaParticipacoes,
  tabelaParticipacoesAtividades,
  tabelaRegistroCheckinAtividade,
  tabelaUsuario,
} from 'src/db/schema';
import {
  renderAttendanceReportPdf,
  renderMonitorReportPdf,
  type ActivityAttendanceSection,
} from './pdf/event-report.pdf';

type AuditLog = {
  participacaoId: number;
  atividadeId: number;
  acao: 'confirmacao' | 'exclusao';
  autorUsuarioId: number;
  realizadoEm: Date;
};

@Injectable()
export class ReportService {
  private formatDateTime(date: Date | null): string {
    if (!date) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Bahia',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(date);
  }

  private async getEventForOrganizer(eventId: number, userId: number) {
    const [event] = await db
      .select()
      .from(tabelaEvento)
      .where(eq(tabelaEvento.id, eventId))
      .limit(1);
    if (!event) throw new NotFoundException('Evento não encontrado.');

    const [organizer] = await db
      .select({ id: tabelaParticipacoes.id })
      .from(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.eventoId, eventId),
          eq(tabelaParticipacoes.usuarioId, userId),
          eq(tabelaParticipacoes.tipo, 'organizador'),
        ),
      )
      .limit(1);
    if (!organizer) {
      throw new ForbiddenException(
        'Apenas organizadores do evento podem gerar relatórios.',
      );
    }
    return event;
  }

  private async getActivity(eventId: number, activityId: number) {
    const [activity] = await db
      .select()
      .from(tabelaAtividade)
      .where(
        and(
          eq(tabelaAtividade.id, activityId),
          eq(tabelaAtividade.eventoId, eventId),
        ),
      )
      .limit(1);
    if (!activity) {
      throw new NotFoundException('Atividade não encontrada neste evento.');
    }
    return activity;
  }

  private async getAuditLogs(activityIds: number[]): Promise<AuditLog[]> {
    const logs = await Promise.all(
      activityIds.map((activityId) =>
        db
          .select({
            participacaoId: tabelaRegistroCheckinAtividade.participacaoId,
            atividadeId: tabelaRegistroCheckinAtividade.atividadeId,
            acao: tabelaRegistroCheckinAtividade.acao,
            autorUsuarioId: tabelaRegistroCheckinAtividade.autorUsuarioId,
            realizadoEm: tabelaRegistroCheckinAtividade.realizadoEm,
          })
          .from(tabelaRegistroCheckinAtividade)
          .where(eq(tabelaRegistroCheckinAtividade.atividadeId, activityId))
          .orderBy(asc(tabelaRegistroCheckinAtividade.realizadoEm)),
      ),
    );
    return logs.flat();
  }

  private async attendanceSections(
    eventId: number,
    activityId?: number,
  ): Promise<ActivityAttendanceSection[]> {
    const activities = await db
      .select()
      .from(tabelaAtividade)
      .where(
        activityId
          ? and(
              eq(tabelaAtividade.eventoId, eventId),
              eq(tabelaAtividade.id, activityId),
            )
          : eq(tabelaAtividade.eventoId, eventId),
      )
      .orderBy(asc(tabelaAtividade.dataInicio));

    const logs = await this.getAuditLogs(activities.map((activity) => activity.id));
    const authors = await db
      .select({ id: tabelaUsuario.id, nome: tabelaUsuario.nome })
      .from(tabelaUsuario);
    const authorNames = new Map(authors.map((author) => [author.id, author.nome]));

    const latestConfirmation = new Map<string, AuditLog>();
    const histories = new Map<number, AuditLog[]>();
    for (const log of logs) {
      const key = `${log.participacaoId}:${log.atividadeId}`;
      if (log.acao === 'confirmacao') latestConfirmation.set(key, log);
      histories.set(log.atividadeId, [...(histories.get(log.atividadeId) ?? []), log]);
    }

    return Promise.all(
      activities.map(async (activity) => {
        const members = await db
          .select({
            participacaoId: tabelaParticipacoesAtividades.participacaoId,
            presente: tabelaParticipacoesAtividades.presente,
            dataPresenca: tabelaParticipacoesAtividades.dataPresenca,
            nome: tabelaUsuario.nome,
            email: tabelaUsuario.email,
            tipo: tabelaParticipacoes.tipo,
          })
          .from(tabelaParticipacoesAtividades)
          .innerJoin(
            tabelaParticipacoes,
            eq(tabelaParticipacoesAtividades.participacaoId, tabelaParticipacoes.id),
          )
          .innerJoin(tabelaUsuario, eq(tabelaParticipacoes.usuarioId, tabelaUsuario.id))
          .where(eq(tabelaParticipacoesAtividades.atividadeId, activity.id))
          .orderBy(asc(tabelaUsuario.nome));
        const memberNames = new Map(
          members.map((member) => [member.participacaoId, member.nome]),
        );

        return {
          name: activity.nome,
          location: activity.localizacao,
          period: `${this.formatDateTime(activity.dataInicio)} a ${this.formatDateTime(activity.dataFim)}`,
          rows: members.map((member) => {
            const confirmation = latestConfirmation.get(
              `${member.participacaoId}:${activity.id}`,
            );
            return {
              participantName: member.nome,
              email: member.email,
              role: member.tipo,
              present: member.presente,
              checkedInAt:
                member.presente && member.dataPresenca
                  ? this.formatDateTime(member.dataPresenca)
                  : null,
              confirmedBy: member.presente
                ? confirmation
                  ? (authorNames.get(confirmation.autorUsuarioId) ??
                    'Não disponível')
                  : 'Não disponível'
                : null,
            };
          }),
          history: (histories.get(activity.id) ?? [])
            .slice()
            .reverse()
            .map((log) => ({
              participantName:
                memberNames.get(log.participacaoId) ?? 'Participante removido',
              action:
                log.acao === 'confirmacao'
                  ? 'Presença confirmada'
                  : 'Presença excluída',
              author: authorNames.get(log.autorUsuarioId) ?? 'Usuário removido',
              timestamp: this.formatDateTime(log.realizadoEm),
            })),
        };
      }),
    );
  }

  async attendanceReport(eventId: number, userId: number, activityId?: number) {
    const event = await this.getEventForOrganizer(eventId, userId);
    if (activityId) {
      const activity = await this.getActivity(eventId, activityId);
      if (activity.status !== 'finalizada') {
        throw new ForbiddenException(
          'O relatório só fica disponível após a finalização da atividade',
        );
      }
    } else if (event.status !== 'finalizada') {
      throw new ForbiddenException(
        'O relatório só fica disponível após a finalização do evento',
      );
    }

    const sections = await this.attendanceSections(eventId, activityId);
    const isSimpleEvent = !activityId && sections.length === 0;
    if (isSimpleEvent) {
      const members = await db
        .select({
          nome: tabelaUsuario.nome,
          email: tabelaUsuario.email,
          tipo: tabelaParticipacoes.tipo,
        })
        .from(tabelaParticipacoes)
        .innerJoin(tabelaUsuario, eq(tabelaParticipacoes.usuarioId, tabelaUsuario.id))
        .where(eq(tabelaParticipacoes.eventoId, eventId))
        .orderBy(asc(tabelaUsuario.nome));
      sections.push({
        name: 'Participação no evento',
        location: event.localizacao,
        period: `${this.formatDateTime(event.dataInicio)} a ${this.formatDateTime(event.dataFim)}`,
        rows: members.map((member) => ({
          participantName: member.nome,
          email: member.email,
          role: member.tipo,
          present: false,
          checkedInAt: null,
          confirmedBy: null,
        })),
        history: [],
      });
    }

    return renderAttendanceReportPdf({
      title: activityId
        ? 'Relatório de Presença da Atividade'
        : 'Relatório de Presenças',
      eventName: event.nome,
      eventPeriod: `${this.formatDateTime(event.dataInicio)} a ${this.formatDateTime(event.dataFim)}`,
      generatedAt: this.formatDateTime(new Date()),
      sections,
      isSimpleEvent,
    });
  }

  async monitorReport(eventId: number, userId: number) {
    const event = await this.getEventForOrganizer(eventId, userId);
    if (event.status !== 'finalizada') {
      throw new ForbiddenException(
        'O relatório só fica disponível após a finalização do evento',
      );
    }

    const activities = await db
      .select({ id: tabelaAtividade.id, nome: tabelaAtividade.nome })
      .from(tabelaAtividade)
      .where(eq(tabelaAtividade.eventoId, eventId));
    const activityNames = new Map(activities.map((activity) => [activity.id, activity.nome]));
    const logs = (await this.getAuditLogs(activities.map((activity) => activity.id))).filter(
      (log) => log.acao === 'confirmacao',
    );
    const authors = await db
      .select({ id: tabelaUsuario.id, nome: tabelaUsuario.nome, email: tabelaUsuario.email })
      .from(tabelaUsuario);
    const authorMap = new Map(authors.map((author) => [author.id, author]));
    const memberships = await db
      .select({ usuarioId: tabelaParticipacoes.usuarioId, tipo: tabelaParticipacoes.tipo })
      .from(tabelaParticipacoes)
      .where(eq(tabelaParticipacoes.eventoId, eventId));
    const roles = new Map(memberships.map((membership) => [membership.usuarioId, membership.tipo]));

    const groups = new Map<string, AuditLog[]>();
    for (const log of logs) {
      const key = `${log.autorUsuarioId}:${log.atividadeId}`;
      groups.set(key, [...(groups.get(key) ?? []), log]);
    }
    const rows = [...groups.entries()]
      .map(([key, entries]) => {
        const [authorId, activityId] = key.split(':').map(Number);
        const author = authorMap.get(authorId);
        const times = entries
          .map((entry) => entry.realizadoEm)
          .sort((a, b) => a.getTime() - b.getTime());
        return {
          name: author?.nome ?? 'Usuário removido',
          email: author?.email ?? '—',
          role: roles.get(authorId) ?? '—',
          activityName: activityNames.get(activityId) ?? 'Atividade removida',
          firstCheckin: this.formatDateTime(times[0] ?? null),
          lastCheckin: this.formatDateTime(times.at(-1) ?? null),
          totalCheckins: entries.length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.activityName.localeCompare(b.activityName));

    return renderMonitorReportPdf({
      eventName: event.nome,
      eventPeriod: `${this.formatDateTime(event.dataInicio)} a ${this.formatDateTime(event.dataFim)}`,
      generatedAt: this.formatDateTime(new Date()),
      rows,
    });
  }
}
