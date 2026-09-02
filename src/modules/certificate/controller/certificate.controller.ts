// src/modules/certificate/certificate.controller.ts
import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CertificateService } from '../certificate.service';
import { JwtAuthGuard } from 'src/modules/auth/jwt/jwt-auth.guard';

@ApiTags('certificate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('event/:eventoId/certificate')
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @Get()
  @ApiOkResponse({ description: 'Lista de certificados do evento' })
  @ApiNotFoundResponse({ description: 'Nenhum certificado encontrado' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  getCertificatesByEvent(
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.certificateService.getCertificatesByEvent(
      eventoId,
      page,
      limit,
    );
  }

  @Get('stats')
  @ApiOkResponse({
    description:
      'Quantidade de certificados emitidos por papel (ouvinte, monitor, organizador, palestrante)',
  })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  getCertificateStatsByEvent(
    @Param('eventoId', ParseIntPipe) eventoId: number,
  ) {
    return this.certificateService.getCertificateStatsByEvent(eventoId);
  }
}
