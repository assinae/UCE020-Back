import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ParticipationRepository } from './repository/participation.repository';

@Injectable()
export class ParticipationService {
  constructor(private readonly repo: ParticipationRepository) {}

  private formatBrazilDateTime(date: Date | null): string | null {
    if (!date) {
      return null;
    }

    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bahia',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const parts = Object.fromEntries(
      dateParts.map((part) => [part.type, part.value]),
    ) as Record<string, string>;

    const offsetName =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bahia',
        timeZoneName: 'shortOffset',
      })
        .formatToParts(date)
        .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-03:00';

    const offsetMatch = offsetName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    const offsetSign = offsetMatch?.[1] ?? '-';
    const offsetHours = String(parseInt(offsetMatch?.[2] ?? '3', 10)).padStart(
      2,
      '0',
    );
    const offsetMinutes = String(
      parseInt(offsetMatch?.[3] ?? '0', 10),
    ).padStart(2, '0');
    const offset = `${offsetSign}${offsetHours}:${offsetMinutes}`;

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000${offset}`;
  }

  async subscribe(usuarioId: number, eventoId: number) {
    const evento = await this.repo.findEventoById(eventoId);
    if (!evento) {
      throw new NotFoundException('Evento não encontrado');
    }

    if (evento.status === 'finalizada') {
      throw new BadRequestException(
        'Não é possível se inscrever em um evento já finalizado',
      );
    }

    const existente = await this.repo.findSubscription(usuarioId, eventoId);
    if (existente) {
      throw new ConflictException('Usuário já está inscrito neste evento');
    }

    const participacao = await this.repo.subscribe(usuarioId, eventoId);
    return {
      message: 'Inscrição realizada com sucesso',
      data: participacao,
    };
  }

  async unsubscribe(usuarioId: number, eventoId: number) {
    const existente = await this.repo.findSubscription(usuarioId, eventoId);
    if (!existente) {
      throw new NotFoundException('Inscrição não encontrada');
    }

    const presencasConfirmadas =
      await this.repo.findConfirmedAttendancesForEvent(usuarioId, eventoId);

    if (presencasConfirmadas.length > 0) {
      throw new BadRequestException(
        'Não é possível cancelar a inscrição do evento enquanto houver presença confirmada em alguma atividade',
      );
    }

    await this.repo.unsubscribe(usuarioId, eventoId);
    return {
      message: 'Inscrição cancelada com sucesso',
    };
  }

  async findSubscription(usuarioId: number, eventoId: number) {
    const participacao = await this.repo.findSubscription(usuarioId, eventoId);
    if (!participacao) {
      throw new NotFoundException('Inscrição não encontrada');
    } else {
      return {
        message: 'Inscrição encontrada com sucesso',
        data: participacao.tipo,
      };
    }
  }

  async markActivityAttendance(
    operadorId: number,
    eventoId: number,
    atividadeId: number,
    participanteId: number,
  ) {
    const evento = await this.repo.findEventoById(eventoId);
    if (!evento) {
      throw new NotFoundException('Evento não encontrado');
    }

    const atividade = await this.repo.findAtividadeById(atividadeId);
    if (!atividade) {
      throw new NotFoundException('Atividade não encontrada');
    }

    if (atividade.eventoId !== eventoId) {
      throw new BadRequestException(
        'Atividade não pertence ao evento informado',
      );
    }

    const operador = await this.repo.findSubscription(operadorId, eventoId);
    if (!operador || !['monitor'].includes(operador.tipo)) {
      throw new ForbiddenException(
        'Apenas monitores do evento podem marcar presença',
      );
    }

    const participante = await this.repo.findSubscription(
      participanteId,
      eventoId,
    );
    if (!participante) {
      throw new NotFoundException(
        'Participante não está inscrito neste evento',
      );
    }

    const participacaoAtividade = await this.repo.findParticipacaoAtividade(
      participante.id,
      atividadeId,
    );
    if (!participacaoAtividade) {
      throw new NotFoundException(
        'Só é possível marcar presença para participantes inscritos nesta atividade do evento',
      );
    }

    if (participacaoAtividade.presente) {
      throw new ConflictException(
        'Presença já foi marcada para este participante nesta atividade',
      );
    }

    const agora = new Date();
    const inicioAtividade = new Date(atividade.dataInicio);
    const fimAtividade = new Date(atividade.dataFim);

    if (agora < inicioAtividade) {
      throw new BadRequestException(
        'A atividade ainda não começou. A presença só pode ser marcada a partir do horário de início.',
      );
    }

    if (agora > fimAtividade) {
      throw new BadRequestException(
        'A atividade já terminou. Não é mais possível marcar presença.',
      );
    }

    const presenca = await this.repo.markActivityAttendance(
      participante.id,
      atividadeId,
      agora,
    );

    return {
      message: 'Presença marcada com sucesso',
      data: {
        eventoId,
        atividadeId,
        userId: participanteId,
        participacaoId: participante.id,
        presente: presenca.presente,
        dataPresenca: this.formatBrazilDateTime(presenca.dataPresenca),
      },
    };
  }

  async removeActivityAttendance(
    operadorId: number,
    eventoId: number,
    atividadeId: number,
    participanteId: number,
  ) {
    const evento = await this.repo.findEventoById(eventoId);
    if (!evento) {
      throw new NotFoundException('Evento não encontrado');
    }

    const atividade = await this.repo.findAtividadeById(atividadeId);
    if (!atividade) {
      throw new NotFoundException('Atividade não encontrada');
    }

    if (atividade.eventoId !== eventoId) {
      throw new BadRequestException(
        'Atividade não pertence ao evento informado',
      );
    }

    const operador = await this.repo.findSubscription(operadorId, eventoId);
    if (!operador || !['monitor', 'organizador'].includes(operador.tipo)) {
      throw new ForbiddenException(
        'Apenas monitores ou organizadores do evento podem remover presença',
      );
    }

    const participante = await this.repo.findSubscription(
      participanteId,
      eventoId,
    );
    if (!participante) {
      throw new NotFoundException(
        'Participante não está inscrito neste evento',
      );
    }

    const participacaoAtividade = await this.repo.findParticipacaoAtividade(
      participante.id,
      atividadeId,
    );
    if (!participacaoAtividade) {
      throw new NotFoundException(
        'Só é possível remover presença para participantes inscritos nesta atividade do evento',
      );
    }

    if (!participacaoAtividade.presente) {
      throw new BadRequestException(
        'Este participante não possui presença confirmada para remover',
      );
    }

    const presenca = await this.repo.removeActivityAttendance(
      participante.id,
      atividadeId,
    );

    return {
      message: 'Presença removida com sucesso',
      data: {
        eventoId,
        atividadeId,
        userId: participanteId,
        participacaoId: participante.id,
        presente: presenca.presente,
        dataPresenca: this.formatBrazilDateTime(presenca.dataPresenca),
      },
    };
  }

  async listActivityParticipants(eventoId: number, atividadeId: number) {
    const evento = await this.repo.findEventoById(eventoId);
    if (!evento) {
      throw new NotFoundException('Evento não encontrado');
    }

    const atividade = await this.repo.findAtividadeById(atividadeId);
    if (!atividade) {
      throw new NotFoundException('Atividade não encontrada');
    }

    if (atividade.eventoId !== eventoId) {
      throw new BadRequestException(
        'Atividade não pertence ao evento informado',
      );
    }

    const participantes =
      await this.repo.findParticipantsByActivity(atividadeId);

    return {
      message: 'Participantes da atividade obtidos com sucesso',
      data: participantes.map((participante) => ({
        ...participante,
        dataPresenca: this.formatBrazilDateTime(participante.dataPresenca),
      })),
    };
  }

  async getAttendanceContext(eventoId: number, atividadeId: number) {
    const evento = await this.repo.findEventoById(eventoId);
    if (!evento) {
      throw new NotFoundException('Evento não encontrado');
    }

    const atividade = await this.repo.findAtividadeById(atividadeId);
    if (!atividade) {
      throw new NotFoundException('Atividade não encontrada');
    }

    if (atividade.eventoId !== eventoId) {
      throw new BadRequestException(
        'Atividade não pertence ao evento informado',
      );
    }

    return {
      message: 'Contexto de validação obtido com sucesso',
      data: {
        eventId: evento.id,
        activityId: atividade.id,
        eventName: evento.nome,
        activityTitle: atividade.nome,
      },
    };
  }
}
