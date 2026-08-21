import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { db } from 'src/db';
import {
  tabelaAtividade,
  tabelaParticipacoes,
  tabelaParticipacoesAtividades,
  tabelaUsuario,
} from 'src/db/schema';
import { CreateActivityDto } from './dto/create-activity.dto';
import { FindAllActivitiesDto } from './dto/find-activities.dto';
import { UpdateActivityDto } from './dto/update-acitivity.dto';
import { SupabaseStorageService } from 'src/common/storage/supabase-storage.service';
import { parseEventDate } from 'src/common/helpers/parse-event-date.helper';

@Injectable()
export class ActivityService {
  constructor(private readonly storage: SupabaseStorageService) {}

  async assertAuthenticatedUserExists(userId: number): Promise<void> {
    const [user] = await db
      .select({ id: tabelaUsuario.id })
      .from(tabelaUsuario)
      .where(eq(tabelaUsuario.id, userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException(
        'Usuario autenticado nao existe no banco. Faca login novamente.',
      );
    }
  }

  async create({ dto, userId }: { dto: CreateActivityDto; userId: number }) {
    await this.assertAuthenticatedUserExists(userId);

    const createdActivities = await db
      .insert(tabelaAtividade)
      .values({
        nome: dto.name,
        descricao: dto.description,
        localizacao: dto.location,
        dataInicio: parseEventDate(dto.startDate),
        dataFim: parseEventDate(dto.endDate),
        categoria: dto.category,
        cargaHoraria: dto.workload ?? 0,
        status: 'pendente',
        foto: dto.foto,
        eventoId: dto.eventId,
      })
      .returning();

    const createdActivity = createdActivities.at(0);

    if (!createdActivity) {
      throw new BadRequestException('Não foi possível criar a atividade');
    }

    return {
      success: true,
      data: {
        activity: createdActivity,
      },
    };
  }

  async findAll(query: FindAllActivitiesDto) {
    void query;

    const activities = await db.select().from(tabelaAtividade);

    return {
      success: true,
      data: activities,
    };
  }

  async findParticipants(id: number): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      presenceStatus: 'pending' | 'confirmed';
    }>;
  }> {
    const activities = await db
      .select()
      .from(tabelaAtividade)
      .where(eq(tabelaAtividade.id, id));

    const activity = activities.at(0);

    if (!activity) {
      throw new NotFoundException('Atividade não encontrada');
    }

    const participants = await db
      .select({
        id: tabelaUsuario.id,
        name: tabelaUsuario.nome,
        email: tabelaUsuario.email,
        role: tabelaParticipacoes.tipo,
      })
      .from(tabelaParticipacoesAtividades)
      .innerJoin(
        tabelaParticipacoes,
        eq(
          tabelaParticipacoes.id,
          tabelaParticipacoesAtividades.participacaoId,
        ),
      )
      .innerJoin(
        tabelaUsuario,
        eq(tabelaUsuario.id, tabelaParticipacoes.usuarioId),
      )
      .where(eq(tabelaParticipacoesAtividades.atividadeId, id))
      .orderBy(asc(tabelaUsuario.nome));

    return {
      success: true,
      data: participants.map((participant) => ({
        id: String(participant.id),
        name: participant.name,
        email: participant.email,
        role: participant.role,
        presenceStatus: 'pending',
      })),
    };
  }

  async findOne(id: number, userId?: number) {
    const activities = await db
      .select()
      .from(tabelaAtividade)
      .where(eq(tabelaAtividade.id, id));

    const activity = activities.at(0);

    if (!activity) {
      throw new NotFoundException('Atividade não encontrada');
    }

    let isRegistered = false;

    if (typeof userId === 'number') {
      const participations = await db
        .select()
        .from(tabelaParticipacoes)
        .where(
          and(
            eq(tabelaParticipacoes.usuarioId, userId),
            eq(tabelaParticipacoes.eventoId, activity.eventoId),
          ),
        );

      const participation = participations.at(0);

      if (participation) {
        const existingSubscriptions = await db
          .select()
          .from(tabelaParticipacoesAtividades)
          .where(
            and(
              eq(
                tabelaParticipacoesAtividades.participacaoId,
                participation.id,
              ),
              eq(tabelaParticipacoesAtividades.atividadeId, id),
            ),
          );

        isRegistered = existingSubscriptions.length > 0;
      }
    }

    return {
      success: true,
      data: {
        ...activity,
        isRegistered,
      },
    };
  }

  async subscribe(id: number, userId: number) {
    const activities = await db
      .select()
      .from(tabelaAtividade)
      .where(eq(tabelaAtividade.id, id));

    const activity = activities.at(0);

    if (!activity) {
      throw new NotFoundException('Atividade não encontrada');
    }

    const participations = await db
      .select()
      .from(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.usuarioId, userId),
          eq(tabelaParticipacoes.eventoId, activity.eventoId),
        ),
      );

    let participationId: number;
    const participation = participations.at(0);

    if (!participation) {
      const createdParticipations = await db
        .insert(tabelaParticipacoes)
        .values({
          usuarioId: userId,
          eventoId: activity.eventoId,
          tipo: 'participante',
        })
        .returning();

      const createdParticipation = createdParticipations.at(0);

      if (!createdParticipation) {
        throw new BadRequestException('Não foi possível criar a participação');
      }

      participationId = createdParticipation.id;
    } else {
      participationId = participation.id;
    }

    const existingSubscriptions = await db
      .select()
      .from(tabelaParticipacoesAtividades)
      .where(
        and(
          eq(tabelaParticipacoesAtividades.participacaoId, participationId),
          eq(tabelaParticipacoesAtividades.atividadeId, id),
        ),
      );

    if (existingSubscriptions.length > 0) {
      throw new BadRequestException('Usuário já inscrito nesta atividade');
    }

    await db.insert(tabelaParticipacoesAtividades).values({
      participacaoId: participationId,
      atividadeId: id,
    });

    return {
      success: true,
      data: {
        activityId: id,
        userId,
        participationId,
      },
    };
  }

  async unsubscribe(id: number, userId: number) {
    const activities = await db
      .select()
      .from(tabelaAtividade)
      .where(eq(tabelaAtividade.id, id));

    const activity = activities.at(0);

    if (!activity) {
      throw new NotFoundException('Atividade não encontrada');
    }

    const participations = await db
      .select()
      .from(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.usuarioId, userId),
          eq(tabelaParticipacoes.eventoId, activity.eventoId),
        ),
      );

    const participation = participations.at(0);

    if (!participation) {
      throw new NotFoundException(
        'Participação não encontrada para este usuário',
      );
    }

    const existingSubscriptions = await db
      .select()
      .from(tabelaParticipacoesAtividades)
      .where(
        and(
          eq(tabelaParticipacoesAtividades.participacaoId, participation.id),
          eq(tabelaParticipacoesAtividades.atividadeId, id),
        ),
      );

    if (existingSubscriptions.length === 0) {
      throw new BadRequestException(
        'Usuário não está inscrito nesta atividade',
      );
    }

    const hasConfirmedPresence = existingSubscriptions.some(
      (subscription) => subscription.presente === true,
    );

    if (hasConfirmedPresence) {
      throw new BadRequestException(
        'Não é possível cancelar a inscrição da atividade com presença confirmada',
      );
    }

    await db
      .delete(tabelaParticipacoesAtividades)
      .where(
        and(
          eq(tabelaParticipacoesAtividades.participacaoId, participation.id),
          eq(tabelaParticipacoesAtividades.atividadeId, id),
        ),
      );

    return {
      success: true,
      data: {
        activityId: id,
        userId,
        participationId: participation.id,
      },
    };
  }

  async update({
    id,
    dto,
    userId,
  }: {
    id: number;
    dto: UpdateActivityDto;
    userId: number;
  }) {
    await this.assertAuthenticatedUserExists(userId);

    const activities = await db
      .select()
      .from(tabelaAtividade)
      .where(eq(tabelaAtividade.id, id));

    const currentActivity = activities.at(0);

    if (!currentActivity) {
      throw new NotFoundException('Atividade não encontrada');
    }

    const updatedActivities = await db
      .update(tabelaAtividade)
      .set({
        nome: dto.name ?? currentActivity.nome,
        descricao: dto.description ?? currentActivity.descricao,
        localizacao: dto.location ?? currentActivity.localizacao,
        categoria: dto.category ?? currentActivity.categoria,
        cargaHoraria: dto.workload ?? currentActivity.cargaHoraria,
        dataInicio: dto.startDate
          ? parseEventDate(dto.startDate)
          : currentActivity.dataInicio,
        dataFim: dto.endDate
          ? parseEventDate(dto.endDate)
          : currentActivity.dataFim,
        foto: dto.foto ?? currentActivity.foto,
      })
      .where(eq(tabelaAtividade.id, id))
      .returning();

    const updatedActivity = updatedActivities.at(0);

    if (!updatedActivity) {
      throw new BadRequestException('Não foi possível atualizar a atividade');
    }

    if (dto.foto && currentActivity.foto && dto.foto !== currentActivity.foto) {
      await this.storage.tryRemoveByPublicUrl(currentActivity.foto);
    }

    return {
      success: true,
      data: {
        activity: updatedActivity,
      },
    };
  }

  async remove({ id }: { id: number; userId: number }) {
    const activities = await db
      .select()
      .from(tabelaAtividade)
      .where(eq(tabelaAtividade.id, id));

    const activity = activities.at(0);

    if (!activity) {
      throw new NotFoundException('Atividade não encontrada');
    }

    await db.delete(tabelaAtividade).where(eq(tabelaAtividade.id, id));

    await this.storage.tryRemoveByPublicUrl(activity.foto);

    return {
      success: true,
      data: {
        activity,
      },
    };
  }
}
