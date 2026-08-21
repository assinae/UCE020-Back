import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  tabelaEvento,
  tabelaParticipacoes,
  tabelaAtividade,
  tabelaUsuario,
} from '../../db/schema';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ActivityService } from '../activity/activity.service';
import { assertEventOrganizer } from 'src/common/helpers/assert-event-organizer.helper';
import { SupabaseStorageService } from 'src/common/storage/supabase-storage.service';
import { parseEventDate } from 'src/common/helpers/parse-event-date.helper';

export type TipoParticipante = 'participante' | 'organizador' | 'monitor';

@Injectable()
export class EventService {
  constructor(
    private readonly activityService: ActivityService,
    private readonly storage: SupabaseStorageService,
  ) {}

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

  private async gerarCodigoUnico(nome: string): Promise<string> {
    const prefixo = nome
      .replace(/[^a-zA-Z]/g, '')
      .toUpperCase()
      .substring(0, 3)
      .padEnd(3, 'X');

    for (let tentativas = 0; tentativas < 10; tentativas++) {
      const sufixo = Math.floor(1000 + Math.random() * 9000).toString();
      const codigo = `${prefixo}${sufixo}`;

      const [existente] = await db
        .select({ id: tabelaEvento.id })
        .from(tabelaEvento)
        .where(eq(tabelaEvento.codigo, codigo))
        .limit(1);

      if (!existente) {
        return codigo;
      }
    }

    return `${prefixo}${Date.now().toString().slice(-4)}`;
  }

  private async prepareActivityPhoto(
    foto: string | undefined,
    ownerId: number | string,
  ): Promise<{ foto?: string; uploadedUrl?: string }> {
    if (!foto?.startsWith('data:')) {
      return { foto };
    }

    const uploadedUrl = await this.storage.uploadDataUrl(
      'Atividades',
      foto,
      ownerId,
    );

    return { foto: uploadedUrl, uploadedUrl };
  }

  async create(createEventDto: CreateEventDto, userId: number) {
    await this.assertAuthenticatedUserExists(userId);

    const codigo =
      createEventDto.codigo?.trim() ||
      (await this.gerarCodigoUnico(createEventDto.nome));

    const novoEvento = await db.transaction(async (tx) => {
      const [evento] = await tx
        .insert(tabelaEvento)
        .values({
          nome: createEventDto.nome,
          codigo,
          descricao: createEventDto.descricao,
          localizacao: createEventDto.localizacao,
          responsavel: createEventDto.responsavel,
          cargaHoraria: createEventDto.cargaHoraria,
          dataInicio: parseEventDate(createEventDto.dataInicio),
          dataFim: parseEventDate(createEventDto.dataFim),
          status: createEventDto.status,
          foto: createEventDto.foto,
        })
        .returning();

      if (!evento) {
        throw new BadRequestException('Nao foi possivel criar o evento.');
      }

      await tx.insert(tabelaParticipacoes).values({
        usuarioId: userId,
        eventoId: evento.id,
        tipo: 'organizador',
      });

      return evento;
    });

    const atividadesCriadas: any[] = [];
    const atividadesComErro: { input: any; error: string }[] = [];

    if (createEventDto.atividades?.length) {
      for (const atividadeDto of createEventDto.atividades) {
        let uploadedActivityPhotoUrl: string | undefined;

        try {
          const preparedPhoto = await this.prepareActivityPhoto(
            atividadeDto.foto,
            novoEvento.id,
          );
          uploadedActivityPhotoUrl = preparedPhoto.uploadedUrl;

          const resultado = await this.activityService.create({
            dto: {
              eventId: novoEvento.id,
              name: atividadeDto.name,
              description: atividadeDto.description,
              location: atividadeDto.location,
              category: atividadeDto.category,
              workload: atividadeDto.workload,
              startDate: atividadeDto.startDate,
              endDate: atividadeDto.endDate,
              foto: preparedPhoto.foto,
              guests: atividadeDto.guests,
            },
            userId,
          });

          atividadesCriadas.push(resultado.data.activity);
        } catch (error) {
          if (uploadedActivityPhotoUrl) {
            await this.storage.tryRemoveByPublicUrl(uploadedActivityPhotoUrl);
          }

          atividadesComErro.push({
            input: atividadeDto,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      }
    }

    return {
      message:
        atividadesComErro.length > 0
          ? 'Evento criado com sucesso, mas algumas atividades não puderam ser criadas.'
          : 'Evento criado com sucesso.',
      data: {
        ...novoEvento,
        atividades: atividadesCriadas,
        ...(atividadesComErro.length > 0 && { atividadesComErro }),
      },
    };
  }

  async findAll() {
    const eventos = await db
      .select()
      .from(tabelaEvento)
      .orderBy(tabelaEvento.dataInicio);

    return {
      message: 'Eventos listados com sucesso.',
      data: eventos,
    };
  }

  async findByCodigo(codigo: string) {
    const [evento] = await db
      .select()
      .from(tabelaEvento)
      .where(eq(tabelaEvento.codigo, codigo))
      .limit(1);

    if (!evento) {
      throw new NotFoundException(
        `Evento com código "${codigo}" não encontrado.`,
      );
    }

    return {
      message: 'Evento encontrado.',
      data: evento,
    };
  }

  async findEventsByUser(
    userId: number,
    tipo?: TipoParticipante,
  ): Promise<{ message: string; data: Array<Record<string, unknown>> }> {
    const filtros = [eq(tabelaParticipacoes.usuarioId, userId)];

    if (tipo) {
      filtros.push(eq(tabelaParticipacoes.tipo, tipo));
    }

    const eventos = await db
      .select({ evento: tabelaEvento })
      .from(tabelaEvento)
      .innerJoin(
        tabelaParticipacoes,
        eq(tabelaParticipacoes.eventoId, tabelaEvento.id),
      )
      .where(and(...filtros))
      .orderBy(tabelaEvento.dataInicio);

    return {
      message: 'Eventos do usuário listados com sucesso.',
      data: eventos.map((row) => row.evento),
    };
  }

  async findOne(id: number) {
    const evento = await db.query.tabelaEvento.findFirst({
      where: eq(tabelaEvento.id, id),
      with: {
        atividades: {
          with: {
            convidados: {
              with: {
                convidado: true,
              },
            },
          },
        },
      },
    });

    if (!evento) {
      throw new NotFoundException(`Evento com ID ${id} não encontrado.`);
    }

    const [{ totalInscritos }] = await db
      .select({
        totalInscritos: sql<number>`count(${tabelaParticipacoes.id})::int`,
      })
      .from(tabelaParticipacoes)
      .where(eq(tabelaParticipacoes.eventoId, id));

    const atividadesFormatadas = evento.atividades.map((atividade) => ({
      id: atividade.id,
      name: atividade.nome,
      description: atividade.descricao,
      location: atividade.localizacao,
      category: atividade.categoria,
      workload: atividade.cargaHoraria,
      startDate: atividade.dataInicio,
      endDate: atividade.dataFim,
      eventId: atividade.eventoId,
      guests: atividade.convidados.map((vinculo) => ({
        id: vinculo.convidado.id,
        name: vinculo.convidado.nome,
        email: vinculo.convidado.email,
        role: vinculo.funcao,
      })),
    }));

    return {
      message: 'Evento encontrado.',
      data: {
        ...evento,
        atividades: atividadesFormatadas,
        totalInscritos,
      },
    };
  }

  async update(id: number, updateEventDto: UpdateEventDto, userId: number) {
    const [eventoExistente] = await db
      .select()
      .from(tabelaEvento)
      .where(eq(tabelaEvento.id, id))
      .limit(1);

    if (!eventoExistente) {
      throw new NotFoundException(`Evento com ID ${id} não encontrado.`);
    }

    if (eventoExistente.status === 'finalizada') {
      throw new BadRequestException(
        'Não é possível editar um evento já finalizado.',
      );
    }

    await assertEventOrganizer(userId, eventoExistente.id);

    const { atividades, dataInicio, dataFim, ...dadosEvento } = updateEventDto;

    const [eventoAtualizado] = await db
      .update(tabelaEvento)
      .set({
        ...dadosEvento,
        ...(dataInicio !== undefined && {
          dataInicio: parseEventDate(dataInicio),
        }),
        ...(dataFim !== undefined && {
          dataFim: parseEventDate(dataFim),
        }),
      })
      .where(eq(tabelaEvento.id, id))
      .returning();

    if (
      dadosEvento.foto &&
      eventoExistente.foto &&
      dadosEvento.foto !== eventoExistente.foto
    ) {
      await this.storage.tryRemoveByPublicUrl(eventoExistente.foto);
    }

    const atividadesAtualizadas: any[] = [];
    const atividadesComErro: { input: any; error: string }[] = [];

    if (atividades !== undefined) {
      const atividadesExistentes = await db
        .select({ id: tabelaAtividade.id })
        .from(tabelaAtividade)
        .where(eq(tabelaAtividade.eventoId, id));

      const idsExistentes = atividadesExistentes.map((a) => a.id);
      const idsRecebidos = atividades
        .filter((a) => a.id !== undefined)
        .map((a) => a.id as number);

      const idsParaRemover = idsExistentes.filter(
        (existenteId) => !idsRecebidos.includes(existenteId),
      );

      for (const atividadeId of idsParaRemover) {
        try {
          await this.activityService.remove({ id: atividadeId, userId });
        } catch (error) {
          atividadesComErro.push({
            input: { id: atividadeId },
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      }

      for (const atividadeDto of atividades) {
        let uploadedActivityPhotoUrl: string | undefined;

        try {
          const preparedPhoto = await this.prepareActivityPhoto(
            atividadeDto.foto,
            atividadeDto.id ?? id,
          );
          uploadedActivityPhotoUrl = preparedPhoto.uploadedUrl;

          if (atividadeDto.id) {
            const resultado = await this.activityService.update({
              id: atividadeDto.id,
              dto: {
                name: atividadeDto.name,
                description: atividadeDto.description,
                location: atividadeDto.location,
                category: atividadeDto.category,
                workload: atividadeDto.workload,
                startDate: atividadeDto.startDate,
                endDate: atividadeDto.endDate,
                guests: atividadeDto.guests,
                eventId: atividadeDto.eventId,
                foto: preparedPhoto.foto,
              },
              userId,
            });
            atividadesAtualizadas.push(resultado.data.activity);
          } else {
            const resultado = await this.activityService.create({
              dto: {
                eventId: id,
                name: atividadeDto.name,
                description: atividadeDto.description,
                location: atividadeDto.location,
                category: atividadeDto.category,
                workload: atividadeDto.workload,
                startDate: atividadeDto.startDate,
                endDate: atividadeDto.endDate,
                foto: preparedPhoto.foto,
                guests: atividadeDto.guests,
              },
              userId,
            });
            atividadesAtualizadas.push(resultado.data.activity);
          }
        } catch (error) {
          if (uploadedActivityPhotoUrl) {
            await this.storage.tryRemoveByPublicUrl(uploadedActivityPhotoUrl);
          }

          atividadesComErro.push({
            input: atividadeDto,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      }
    }

    return {
      message:
        atividadesComErro.length > 0
          ? 'Evento atualizado com sucesso, mas algumas atividades não puderam ser processadas.'
          : 'Evento atualizado com sucesso.',
      data: {
        ...eventoAtualizado,
        atividades: atividadesAtualizadas,
        ...(atividadesComErro.length > 0 && { atividadesComErro }),
      },
    };
  }

  async finalizar(id: number, userId: number) {
    const [eventoExistente] = await db
      .select()
      .from(tabelaEvento)
      .where(eq(tabelaEvento.id, id))
      .limit(1);

    if (!eventoExistente) {
      throw new NotFoundException(`Evento com ID ${id} não encontrado.`);
    }

    const [participacao] = await db
      .select()
      .from(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.usuarioId, userId),
          eq(tabelaParticipacoes.eventoId, id),
        ),
      )
      .limit(1);

    if (!participacao || participacao.tipo !== 'organizador') {
      throw new ForbiddenException(
        'Apenas o organizador do evento pode finalizá-lo.',
      );
    }

    if (eventoExistente.status === 'finalizada') {
      throw new BadRequestException('Evento já está finalizado.');
    }

    const [eventoAtualizado] = await db
      .update(tabelaEvento)
      .set({ status: 'finalizada' })
      .where(eq(tabelaEvento.id, id))
      .returning();

    // Finaliza em cascata as atividades do evento — hoje é a única forma de uma
    // atividade chegar a 'finalizada', necessário para liberar a emissão de
    // certificado de convidado (ver CertificateService.generateGuestCertificates).
    await db
      .update(tabelaAtividade)
      .set({ status: 'finalizada' })
      .where(eq(tabelaAtividade.eventoId, id));

    return {
      message: 'Evento finalizado com sucesso.',
      data: eventoAtualizado,
    };
  }

  async remove(id: number, userId: number) {
    const [eventoExistente] = await db
      .select()
      .from(tabelaEvento)
      .where(eq(tabelaEvento.id, id))
      .limit(1);

    if (!eventoExistente) {
      throw new NotFoundException(`Evento com ID ${id} não encontrado.`);
    }

    await assertEventOrganizer(userId, eventoExistente.id);

    if (eventoExistente.status !== 'pendente') {
      throw new BadRequestException(
        'Apenas eventos com status "pendente" podem ser deletados.',
      );
    }

    const activityPhotos = await db
      .select({ foto: tabelaAtividade.foto })
      .from(tabelaAtividade)
      .where(eq(tabelaAtividade.eventoId, id));

    await db.delete(tabelaEvento).where(eq(tabelaEvento.id, id));

    await this.storage.tryRemoveByPublicUrl(eventoExistente.foto);
    await Promise.all(
      activityPhotos.map((activity) =>
        this.storage.tryRemoveByPublicUrl(activity.foto),
      ),
    );

    return {
      message: 'Evento removido com sucesso.',
      data: eventoExistente,
    };
  }

  // Métodos auxiliares para membros

  async checkIsOrganizer(eventId: number, userId: number): Promise<void> {
    const [participacao] = await db
      .select()
      .from(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.eventoId, eventId),
          eq(tabelaParticipacoes.usuarioId, userId),
          eq(tabelaParticipacoes.tipo, 'organizador'),
        ),
      )
      .limit(1);

    if (!participacao) {
      throw new ForbiddenException(
        'Apenas organizadores podem gerenciar membros.',
      );
    }
  }

  // Membros do Evento

  async getEventMembers(eventId: number) {
    await this.findOne(eventId); // Garante que o evento existe

    const membros = await db
      .select({
        id: tabelaParticipacoes.id,
        usuarioId: tabelaParticipacoes.usuarioId,
        tipo: tabelaParticipacoes.tipo,
        nome: tabelaUsuario.nome,
        email: tabelaUsuario.email,
      })
      .from(tabelaParticipacoes)
      .innerJoin(
        tabelaUsuario,
        eq(tabelaParticipacoes.usuarioId, tabelaUsuario.id),
      )
      .where(eq(tabelaParticipacoes.eventoId, eventId));

    return {
      message: 'Membros do evento listados com sucesso.',
      data: membros,
    };
  }

  async updateEventMember(
    eventId: number,
    memberUserId: number,
    tipo: TipoParticipante,
    requesterId: number,
  ) {
    await this.checkIsOrganizer(eventId, requesterId);

    const [participacaoExistente] = await db
      .select()
      .from(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.eventoId, eventId),
          eq(tabelaParticipacoes.usuarioId, memberUserId),
        ),
      )
      .limit(1);

    if (!participacaoExistente) {
      throw new NotFoundException(`Membro não encontrado neste evento.`);
    }

    const [participacaoAtualizada] = await db
      .update(tabelaParticipacoes)
      .set({ tipo })
      .where(
        and(
          eq(tabelaParticipacoes.eventoId, eventId),
          eq(tabelaParticipacoes.usuarioId, memberUserId),
        ),
      )
      .returning();

    return {
      message: 'Papel do membro atualizado com sucesso.',
      data: participacaoAtualizada,
    };
  }

  async removeEventMember(
    eventId: number,
    memberUserId: number,
    requesterId: number,
  ) {
    await this.checkIsOrganizer(eventId, requesterId);

    // Não permitir que o organizador se remova caso seja o único organizador (opcional, mas recomendado evitar se remover sem querer)
    // Para simplificar a task, apenas processamos a remoção básica:
    const [participacaoExistente] = await db
      .select()
      .from(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.eventoId, eventId),
          eq(tabelaParticipacoes.usuarioId, memberUserId),
        ),
      )
      .limit(1);

    if (!participacaoExistente) {
      throw new NotFoundException(`Membro não encontrado neste evento.`);
    }

    await db
      .delete(tabelaParticipacoes)
      .where(
        and(
          eq(tabelaParticipacoes.eventoId, eventId),
          eq(tabelaParticipacoes.usuarioId, memberUserId),
        ),
      );

    return {
      message: 'Membro removido do evento com sucesso.',
      data: participacaoExistente,
    };
  }
}
