import {
  Controller,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  UseGuards,
  Get,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { User } from 'src/common/decorators/usuario.decorator';
import type { JwtPayload } from 'src/common/types/jwt-payload.type';
import { ParticipationService } from './participation.service';
import { MarkActivityAttendanceDto } from './dto/mark-activity-attendance.dto';

@ApiTags('participation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('event/:eventoId/subscription')
export class ParticipationController {
  constructor(private readonly participationService: ParticipationService) {}

  @Post()
  @ApiOkResponse({
    description: 'Inscrição realizada com sucesso',
    schema: {
      example: {
        message: 'Inscrição realizada com sucesso!',
        eventoId: 10,
        userId: 1,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Evento já finalizado' })
  @ApiConflictResponse({ description: 'Usuário já inscrito' })
  @ApiNotFoundResponse({ description: 'Evento não encontrado' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  async subscribe(
    @User() user: JwtPayload,
    @Param('eventoId', ParseIntPipe) eventoId: number,
  ) {
    // Aguarda o serviço processar a inscrição no banco
    await this.participationService.subscribe(user.sub, eventoId);

    // Retorna o payload estruturado para o front
    return {
      message: 'Inscrição realizada com sucesso!',
      eventoId: eventoId,
      userId: user.sub,
    };
  }

  @Delete()
  @ApiOkResponse({
    description: 'Inscrição cancelada com sucesso',
    schema: {
      example: {
        message: 'Inscrição cancelada com sucesso.',
        eventoId: 10,
        userId: 1,
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Inscrição não encontrada' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  async unsubscribe(
    @User() user: JwtPayload,
    @Param('eventoId', ParseIntPipe) eventoId: number,
  ) {
    // Aguarda o serviço remover a inscrição no banco
    await this.participationService.unsubscribe(user.sub, eventoId);

    // Retorna o payload de confirmação
    return {
      message: 'Inscrição cancelada com sucesso.',
      eventoId: eventoId,
      userId: user.sub,
    };
  }

  @Get()
  @ApiOkResponse({
    description: 'Tipo de participação do usuário no evento',
    schema: {
      example: {
        message: 'Inscrição encontrada com sucesso',
        eventoId: 10,
        userId: 1,
        tipo: 'organizador',
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Inscrição não encontrada' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  async findSubscription(
    @User() user: JwtPayload,
    @Param('eventoId', ParseIntPipe) eventoId: number,
  ) {
    // Aguarda o serviço buscar o tipo de participação no banco
    const { message, data } = await this.participationService.findSubscription(
      user.sub,
      eventoId,
    );

    // Retorna o payload estruturado para o front
    return {
      message: message,
      //eventoId: eventoId,
      //userId: user.sub,
      tipo: data,
    };
  }

  @Get('progress')
  @ApiOperation({ summary: 'Progresso do usuário logado no evento' })
  @ApiOkResponse({
    description: 'Carga horária cumprida e atividades concluídas no evento',
    schema: {
      example: {
        statusCode: 200,
        message: 'Progresso do evento encontrado com sucesso',
        data: {
          tipo: 'participante',
          cargaHorariaCumprida: 12,
          cargaHorariaTotal: 20,
          atividadesConcluidas: 3,
          totalAtividades: 5,
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Inscrição ou evento não encontrado' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  async getEventProgress(
    @User() user: JwtPayload,
    @Param('eventoId', ParseIntPipe) eventoId: number,
  ) {
    return await this.participationService.getEventProgress(user.sub, eventoId);
  }

  @Post('activity/:atividadeId/attendance')
  @ApiOkResponse({
    description: 'Presença marcada com sucesso',
    schema: {
      example: {
        message: 'Presença marcada com sucesso',
        data: {
          eventoId: 10,
          atividadeId: 3,
          userId: 1,
          participacaoId: 5,
          presente: true,
          dataPresenca: '2026-07-06T23:10:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Atividade não pertence ao evento' })
  @ApiConflictResponse({ description: 'Presença já marcada' })
  @ApiNotFoundResponse({
    description: 'Evento, atividade ou inscrição não encontrada',
  })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  async markActivityAttendance(
    @User() user: JwtPayload,
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
    @Body() markAttendanceDto: MarkActivityAttendanceDto,
  ) {
    return await this.participationService.markActivityAttendance(
      user.sub,
      eventoId,
      atividadeId,
      markAttendanceDto.userId,
    );
  }

  @Delete('activity/:atividadeId/attendance')
  @ApiOkResponse({
    description: 'Presença removida com sucesso',
  })
  @ApiBadRequestResponse({ description: 'Atividade não pertence ao evento' })
  @ApiNotFoundResponse({
    description: 'Evento, atividade ou inscrição não encontrada',
  })
  async removeActivityAttendance(
    @User() user: JwtPayload,
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
    @Body() markAttendanceDto: MarkActivityAttendanceDto,
  ) {
    return await this.participationService.removeActivityAttendance(
      user.sub,
      eventoId,
      atividadeId,
      markAttendanceDto.userId,
    );
  }

  @Get('activity/:atividadeId/participants')
  @ApiOkResponse({
    description: 'Lista de participantes inscritos na atividade',
  })
  @ApiNotFoundResponse({ description: 'Evento ou atividade não encontrada' })
  async listActivityParticipants(
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
  ) {
    return await this.participationService.listActivityParticipants(
      eventoId,
      atividadeId,
    );
  }

  @Get('activity/:atividadeId/context')
  @ApiOkResponse({
    description: 'Contexto do evento e atividade para a validação de presença',
  })
  @ApiNotFoundResponse({ description: 'Evento ou atividade não encontrada' })
  async getAttendanceContext(
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
  ) {
    return await this.participationService.getAttendanceContext(
      eventoId,
      atividadeId,
    );
  }
}
