// src/modules/certificate/controller/certificate-pdf.controller.ts
import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CertificatePdfService } from '../certificate-pdf.service';
import { JwtAuthGuard } from 'src/modules/auth/jwt/jwt-auth.guard';
import { User } from 'src/common/decorators/usuario.decorator';
import type { JwtPayload } from 'src/common/types/jwt-payload.type';

/** Remove o que o sistema de arquivos e o header não aceitam. */
function sanitizeFilename(nome: string): string {
  return nome.replace(/[/\\?%*:|"<>]/g, '').trim();
}

/**
 * Monta o Content-Disposition com as duas formas: `filename` sem acento, para
 * clientes antigos, e `filename*` em UTF-8, que é o que os navegadores usam.
 */
function contentDisposition(nome: string): string {
  const limpo = sanitizeFilename(nome);
  const ascii = limpo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');

  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(limpo)}`;
}

@ApiTags('certificate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('certificate')
export class CertificatePdfController {
  constructor(private readonly certificatePdfService: CertificatePdfService) {}

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Baixar o PDF de um certificado, gerado sob demanda',
    description:
      'Renderiza o PDF no momento da requisição a partir dos dados do banco. ' +
      'Nada é gravado em disco nem no bucket.',
  })
  @ApiParam({
    name: 'id',
    example: 'user-45',
    description: 'Id composto do certificado: "user-<id>" ou "guest-<id>".',
  })
  @ApiOkResponse({ description: 'PDF do certificado.' })
  @ApiForbiddenResponse({ description: 'Não é o titular nem organizador.' })
  @ApiNotFoundResponse({ description: 'Certificado não encontrado.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
  async downloadPdf(
    @Param('id') id: string,
    @User() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { buffer, filename } =
      await this.certificatePdfService.buildCertificatePdf(id, user.sub);

    // @Res() desliga o ResponseInterceptor de propósito: ele envelopa o retorno
    // em { statusCode, data }, o que transformaria o binário do PDF em JSON.
    // É a única rota da API que não segue o envelope padrão — por isso a exceção
    // está explicitada aqui.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
}
