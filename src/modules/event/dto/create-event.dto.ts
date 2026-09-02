import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsString,
  IsDateString,
  Min,
  IsInt,
  IsOptional,
  IsEnum,
  IsObject,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidateNested,
} from 'class-validator';
import { CreateActivityDto } from 'src/modules/activity/dto/create-activity.dto';

export const CERTIFICATE_TEXT_LIMITS = {
  titulo: 70,
  subtitulo: 80,
  nomeEvento: 60,
  nomeParticipante: 60,
  descricaoTotal: 310,
} as const;

function parseJsonField(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function IsCertificateDescriptionWithinLimit(
  validationOptions?: ValidationOptions,
) {
  return function (target: object, propertyKey: string) {
    registerDecorator({
      name: 'isCertificateDescriptionWithinLimit',
      target: target.constructor,
      propertyName: propertyKey,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const textos = args.object as Record<string, unknown>;
          const total = [
            textos.descricaoInicio,
            textos.descricaoEvento,
            textos.descricaoCargaHoraria,
          ].reduce<number>(
            (length, text) =>
              length + (typeof text === 'string' ? text.length : 0),
            0,
          );

          return total <= CERTIFICATE_TEXT_LIMITS.descricaoTotal;
        },
        defaultMessage() {
          return `A soma dos campos da descrição não pode ultrapassar ${CERTIFICATE_TEXT_LIMITS.descricaoTotal} caracteres.`;
        },
      },
    });
  };
}

export class CertificateCustomizationTextsDto {
  @IsString()
  @IsOptional()
  @MaxLength(CERTIFICATE_TEXT_LIMITS.titulo)
  titulo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(CERTIFICATE_TEXT_LIMITS.subtitulo)
  subtitulo?: string;

  @IsString()
  @IsOptional()
  @IsCertificateDescriptionWithinLimit()
  descricaoInicio?: string;

  @IsString()
  @IsOptional()
  @IsCertificateDescriptionWithinLimit()
  descricaoEvento?: string;

  @IsString()
  @IsOptional()
  @IsCertificateDescriptionWithinLimit()
  descricaoCargaHoraria?: string;
}

export class CertificateCustomizationDto {
  @IsString()
  @IsOptional()
  template?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CertificateCustomizationTextsDto)
  @IsOptional()
  textos?: CertificateCustomizationTextsDto;
}

export class CreateEventDto {
  @IsString()
  @MaxLength(CERTIFICATE_TEXT_LIMITS.nomeEvento)
  nome!: string;

  @IsString()
  @IsOptional()
  codigo?: string;

  @IsString()
  descricao!: string;

  @IsString()
  localizacao!: string;

  @IsString()
  responsavel!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  cargaHoraria!: number;

  @IsDateString()
  dataInicio!: string;

  @IsDateString()
  dataFim!: string;

  @IsEnum(['pendente', 'iniciada', 'andamento', 'finalizada'])
  status!: 'pendente' | 'iniciada' | 'andamento' | 'finalizada';

  @IsString()
  @IsOptional()
  foto?: string;

  @IsString()
  @IsOptional()
  templateUrl?: string;

  @IsString()
  @IsOptional()
  certificadoTemplate?: string;

  @IsString()
  @IsOptional()
  template?: string;

  @Transform(({ value }: { value: unknown }) =>
    plainToInstance(CertificateCustomizationDto, parseJsonField(value)),
  )
  @ValidateNested()
  @Type(() => CertificateCustomizationDto)
  @IsOptional()
  certificadoPersonalizacao?: CertificateCustomizationDto;

  @Type(() => Array)
  @IsOptional()
  atividades?: CreateActivityDto[];

  // Dados de assinatura do certificado
  @IsString()
  @IsOptional()
  assinante1Nome?: string;

  @IsString()
  @IsOptional()
  assinante1Titulo?: string;

  @IsString()
  @IsOptional()
  assinante2Nome?: string;

  @IsString()
  @IsOptional()
  assinante2Titulo?: string;
}
