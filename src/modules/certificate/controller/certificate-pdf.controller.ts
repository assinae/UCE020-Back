import {
  Controller,
  Get,
  Headers,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiNotModifiedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CertificatePdfService } from '../certificate-pdf.service';
import { JwtAuthGuard } from 'src/modules/auth/jwt/jwt-auth.guard';
import { User } from 'src/common/decorators/usuario.decorator';
import type { JwtPayload } from 'src/common/types/jwt-payload.type';

function sanitizeFilename(nome: string): string {
  return nome.replace(/[/\\?%*:|"<>]/g, '').trim();
}

/** Duas formas: `filename` sem acento para clientes antigos, `filename*` em UTF-8. */
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
  @ApiNotModifiedResponse({
    description: 'O If-None-Match enviado bate com o ETag atual.',
  })
  @ApiForbiddenResponse({ description: 'Não é o titular nem organizador.' })
  @ApiNotFoundResponse({ description: 'Certificado não encontrado.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
  async downloadPdf(
    @Param('id') id: string,
    @User() user: JwtPayload,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ) {
    const { etag, filename, render } =
      await this.certificatePdfService.prepareCertificatePdf(id, user.sub);

    res.setHeader('ETag', etag);
    // no-cache manda revalidar sempre, não deixar de guardar. A revalidação
    // custa uma consulta; um max-age serviria PDF vencido depois de uma
    // reassinatura, que troca o QR Code e o código de verificação.
    res.setHeader('Cache-Control', 'private, no-cache');

    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    const buffer = await render();

    // @Res() desliga o ResponseInterceptor de propósito: o envelope
    // { statusCode, data } corromperia o binário do PDF.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
}
