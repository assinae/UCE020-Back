import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEnum,
  IsDateString,
  IsBoolean,
  MinLength,
  Min,
  ValidateNested,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { categoriaAtividadeEnum, funcaoConvidadoEnum } from 'src/db/schema';

export class CreateGuestDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString({ message: 'O nome deve ser uma string.' })
  @MinLength(3, { message: 'O nome deve ter no mínimo 3 caracteres.' })
  name!: string;

  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;

  @ApiProperty({ enum: funcaoConvidadoEnum.enumValues, example: 'palestrante' })
  @IsEnum(funcaoConvidadoEnum.enumValues, { message: 'Função inválida.' })
  role!: (typeof funcaoConvidadoEnum.enumValues)[number];
}

export class CreateActivityDto {
  @ApiProperty({ example: 'Introdução ao React' })
  @IsString({ message: 'O nome deve ser uma string.' })
  @MinLength(3, { message: 'O nome deve ter no mínimo 3 caracteres.' })
  name!: string;

  @ApiProperty({
    example: 'Atividade prática com foco em componentes e hooks.',
  })
  @IsString({ message: 'A descrição deve ser uma string.' })
  description!: string;

  @ApiProperty({ example: 'Sala 01' })
  @IsString({ message: 'A localização deve ser uma string.' })
  location!: string;

  @ApiProperty({ enum: categoriaAtividadeEnum.enumValues, example: 'oficina' })
  @IsEnum(categoriaAtividadeEnum.enumValues, { message: 'Categoria inválida.' })
  category!: (typeof categoriaAtividadeEnum.enumValues)[number];

  @ApiPropertyOptional({ example: 4 })
  @Type(() => Number)
  @IsNumber({}, { message: 'A carga horária deve ser um número.' })
  @Min(0, { message: 'A carga horária não pode ser negativa.' })
  @IsOptional()
  workload?: number;

  @ApiProperty({ example: '2026-05-20T08:00:00' })
  @IsDateString(
    {},
    { message: 'Informe uma data e horário de início válidos.' },
  )
  startDate!: string;

  @ApiProperty({ example: '2026-05-20T12:00:00' })
  @IsDateString(
    {},
    { message: 'Informe uma data e horário de término válidos.' },
  )
  endDate!: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber({}, { message: 'O ID do evento deve ser um número.' })
  @Min(1, { message: 'O ID do evento é inválido.' })
  eventId!: number;

  @ApiPropertyOptional({ example: 'https://example.com/activity.png' })
  @IsString({ message: 'A foto deve ser uma string.' })
  @IsOptional()
  foto?: string;

  @ApiPropertyOptional({
    description:
      'Define se será possível gerar certificado individual desta atividade para os participantes com presença confirmada.',
    example: true,
    default: false,
  })
  // O endpoint usa multipart/form-data (por causa do upload de foto), então o
  // valor sempre chega como string ("true"/"false"). `@Type(() => Boolean)`
  // faria `Boolean("false") === true`, então convertemos manualmente.
  @Transform(({ value }: { value: unknown }): unknown => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return value;
  })
  @IsBoolean({ message: 'Gerar certificado deve ser um valor booleano.' })
  @IsOptional()
  generateCertificate?: boolean;

  @ApiPropertyOptional({ type: [CreateGuestDto] })
  @IsArray({ message: 'Os convidados devem ser uma lista.' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateGuestDto)
  guests?: CreateGuestDto[];
}
