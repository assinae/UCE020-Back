import {
  Body, Controller, Get, HttpCode, HttpStatus, Patch, Post,
  Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth, ApiBadRequestResponse, ApiBody, ApiConflictResponse,
  ApiConsumes, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { UserService } from './user.service';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserActivityResponseDto } from './dto/user-activity-response.dto';
// TODO: trocar pelo serviço de storage real do projeto (S3, disco, etc.).
// Aqui ele é só um contrato: recebe o arquivo e devolve a URL final salva.
import { AvatarStorageService } from './avatar-storage.service';
import 'multer';
import type { Request } from 'express';
import { JwtPayload } from 'src/common/types/jwt-payload.type';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class UserProfileController {
  constructor(
    private readonly userService: UserService,
    private readonly avatarStorage: AvatarStorageService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Perfil do usuário autenticado', type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.userService.getUser(req.user.sub);
  }

  @Get('atividade')
  @ApiOperation({
    summary: 'Resumo de atividade do usuário',
    description:
      'Eventos organizados, certificados assinados recebidos, carga horária somada desses certificados e histórico de eventos com o papel do usuário em cada um.',
  })
  @ApiOkResponse({ description: 'Resumo de atividade do usuário', type: UserActivityResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  getActivity(@Req() req: AuthenticatedRequest) {
    return this.userService.getActivitySummary(req.user.sub);
  }

  @Patch()
  @ApiOkResponse({ description: 'Perfil atualizado com sucesso', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  @ApiConflictResponse({ description: 'E-mail já está em uso' })
  updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(req.user.sub, dto);
  }

  @Patch('senha')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Senha alterada com sucesso' })
  @ApiBadRequestResponse({ description: 'Senha atual incorreta ou nova senha inválida' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(req.user.sub, dto);
  }

  @Post('foto')
  @UseInterceptors(FileInterceptor('foto'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { foto: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ description: 'Foto de perfil atualizada com sucesso', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Nenhuma imagem enviada ou formato inválido' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  async updateAvatar(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File) {
    const currentUser = await this.userService.getUser(req.user.sub);
    const avatarUrl = await this.avatarStorage.save(req.user.sub, file);

    try {
      const updatedUser = await this.userService.updateAvatar(req.user.sub, avatarUrl);

      if (currentUser.avatarUrl && currentUser.avatarUrl !== avatarUrl) {
        await this.avatarStorage.remove(currentUser.avatarUrl);
      }

      return updatedUser;
    } catch (error) {
      await this.avatarStorage.remove(avatarUrl);
      throw error;
    }
  }
}
