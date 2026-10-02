import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { User } from 'src/common/decorators/usuario.decorator';
import type { JwtPayload } from 'src/common/types/jwt-payload.type';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { ReportService } from './report.service';

function filename(name: string) {
  return name.replace(/[/\\?%*:|"<>]/g, '').trim();
}

@ApiTags('report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('event/:eventoId/report')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get('attendance.pdf')
  @ApiOkResponse({ description: 'PDF consolidado das presenças do evento.' })
  @ApiForbiddenResponse({ description: 'Exclusivo do organizador, após o evento ser finalizado' })
  async attendance(
    @Param('eventoId', ParseIntPipe) eventId: number,
    @User() user: JwtPayload,
    @Res() res: Response,
  ) {
    const document = await this.reports.attendanceReport(eventId, user.sub);
    this.sendPdf(res, document, `Relatório de Presenças - Evento ${eventId}.pdf`);
  }

  @Get('activity/:atividadeId/attendance.pdf')
  @ApiOkResponse({ description: 'PDF de presenças de uma atividade finalizada' })
  async activityAttendance(
    @Param('eventoId', ParseIntPipe) eventId: number,
    @Param('atividadeId', ParseIntPipe) activityId: number,
    @User() user: JwtPayload,
    @Res() res: Response,
  ) {
    const document = await this.reports.attendanceReport(eventId, user.sub, activityId);
    this.sendPdf(res, document, `Relatório de Presenças - Atividade ${activityId}.pdf`);
  }

  @Get('monitors.pdf')
  @ApiOkResponse({ description: 'PDF com o resumo de operação dos monitores' })
  async monitors(
    @Param('eventoId', ParseIntPipe) eventId: number,
    @User() user: JwtPayload,
    @Res() res: Response,
  ) {
    const document = await this.reports.monitorReport(eventId, user.sub);
    this.sendPdf(res, document, `Relatório de Monitores - Evento ${eventId}.pdf`);
  }

  private sendPdf(res: Response, document: Buffer, reportName: string) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename(reportName))}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', document.length);
    res.send(document);
  }
}
