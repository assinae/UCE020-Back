import { PartialType } from '@nestjs/swagger';
import { CreateActivityDto } from './create-activity.dto';

// PATCH manda apenas os campos alterados — sem PartialType a validação exigiria
// o corpo inteiro (inclusive `eventId`, que o front não reenvia na edição).
export class UpdateActivityDto extends PartialType(CreateActivityDto) {}
