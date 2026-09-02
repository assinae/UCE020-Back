import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CertificateCustomizationDto,
  CertificateCustomizationTextsDto,
  CERTIFICATE_TEXT_LIMITS,
} from './create-event.dto';

function parseJsonField(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export class CertificateCustomizationPreviewEventDto {
  @IsString()
  @MaxLength(CERTIFICATE_TEXT_LIMITS.nomeEvento)
  nome!: string;

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
}

export class CertificateCustomizationPreviewDto {
  @Transform(({ value }: { value: unknown }) =>
    plainToInstance(
      CertificateCustomizationPreviewEventDto,
      parseJsonField(value),
    ),
  )
  @IsObject()
  @ValidateNested()
  evento!: CertificateCustomizationPreviewEventDto;

  @IsString()
  @IsOptional()
  template?: string;

  @IsString()
  @IsOptional()
  templateUrl?: string;

  @Transform(({ value }: { value: unknown }) =>
    plainToInstance(CertificateCustomizationTextsDto, parseJsonField(value)),
  )
  @IsObject()
  @ValidateNested()
  @IsOptional()
  textos?: CertificateCustomizationTextsDto;

  @Transform(({ value }: { value: unknown }) =>
    plainToInstance(CertificateCustomizationDto, parseJsonField(value)),
  )
  @IsObject()
  @ValidateNested()
  @IsOptional()
  certificadoPersonalizacao?: CertificateCustomizationDto;
}
