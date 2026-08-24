// src/modules/certificate/certificate-activity-participant.controller.ts
import {
  Controller,
  Post,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { RequestWithUser } from 'src/common/types/request-with-user.type';
import { CertificateService } from '../certificate.service';
import { JwtAuthGuard } from 'src/modules/auth/jwt/jwt-auth.guard';

@ApiTags('certificate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('activity/:atividadeId/certificate/participants')
export class CertificateActivityParticipantController {
  constructor(private readonly certificateService: CertificateService) {}

  @Post()
  @ApiOperation({
    summary:
      'Emitir certificado individual da atividade para os participantes com presença confirmada',
  })
  @ApiOkResponse({
    description: 'Certificados de atividade emitidos com sucesso.',
  })
  @ApiNotFoundResponse({
    description:
      'Atividade não encontrada ou sem participantes com presença confirmada.',
  })
  @ApiForbiddenResponse({
    description:
      'Apenas organizadores podem emitir certificados, apenas de atividades finalizadas e com a opção "Gerar Certificado da Atividade" habilitada.',
  })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  generateActivityCertificates(
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
    @Req() req: RequestWithUser,
  ) {
    return this.certificateService.generateActivityCertificates(
      atividadeId,
      req.user.sub,
    );
  }
}
