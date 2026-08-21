import { Type } from 'class-transformer';
import {
  IsString,
  IsDateString,
  Min,
  IsInt,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { CreateActivityDto } from 'src/modules/activity/dto/create-activity.dto';

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
