import { ApiProperty } from '@nestjs/swagger';

export class UserEventHistoryItemDto {
  @ApiProperty() participacaoId!: number;
  @ApiProperty() eventoId!: number;
  @ApiProperty() nome!: string;
  @ApiProperty() dataInicio!: Date;
  @ApiProperty() dataFim!: Date;
  @ApiProperty({ enum: ['pendente', 'iniciada', 'andamento', 'finalizada'] })
  status!: string;
  @ApiProperty() cargaHoraria!: number;
  @ApiProperty({ enum: ['participante', 'organizador', 'monitor'] })
  papel!: string;
  @ApiProperty({
    description: 'Se o usuário tem certificado assinado deste evento',
  })
  possuiCertificado!: boolean;
}

export class UserActivityDto {
  @ApiProperty() eventosOrganizados!: number;
  @ApiProperty({
    description: 'Certificados assinados de eventos e de atividades',
  })
  certificadosRecebidos!: number;
  @ApiProperty({
    description: 'Soma da carga horária dos certificados assinados',
  })
  cargaHorariaTotal!: number;
  @ApiProperty({ type: [UserEventHistoryItemDto] })
  historico!: UserEventHistoryItemDto[];
}

export class UserActivityResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty({ type: UserActivityDto }) data!: UserActivityDto;
}
