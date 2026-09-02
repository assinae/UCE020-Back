import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsString,
  IsDateString,
  Min,
  IsInt,
  IsOptional,
  IsEnum,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { CreateActivityDto } from 'src/modules/activity/dto/create-activity.dto';

function parseJsonField(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export class CertificateCustomizationTextsDto {
  @IsString()
  @IsOptional()
  titulo?: string;

  @IsString()
  @IsOptional()
  subtitulo?: string;

  @IsString()
  @IsOptional()
  descricaoInicio?: string;

  @IsString()
  @IsOptional()
  descricaoEvento?: string;

  @IsString()
  @IsOptional()
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
