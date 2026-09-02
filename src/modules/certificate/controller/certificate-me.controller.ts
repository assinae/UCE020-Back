// src/modules/certificate/certificate-me.controller.ts
import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import type { RequestWithUser } from 'src/common/types/request-with-user.type';
import { JwtAuthGuard } from 'src/modules/auth/jwt/jwt-auth.guard';
import { CertificateService } from '../certificate.service';

@ApiTags('certificate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('certificate')
export class CertificateMeController {
  constructor(private readonly certificateService: CertificateService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'Lista todos os certificados do usuário logado, de todos os eventos',
  })
  @ApiOkResponse({ description: 'Lista de certificados do usuário' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  getMyCertificates(
    @Req() req: RequestWithUser,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 100,
  ) {
    return this.certificateService.getCertificatesByUser(
      req.user.sub,
      page,
      limit,
    );
  }
}
