import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable} from '@nestjs/common';
import { User } from '../types/user';
import { JwtPayload } from 'src/common/types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Sem fallback de propósito: o valor antigo era um literal commitado no
      // repositório, então um deploy sem JWT_SECRET aceitava token assinado por
      // qualquer pessoa com acesso ao código. Agora o env.validation barra
      // antes, e a construção falha alto se ainda assim faltar.
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  validate(payload: User): JwtPayload {
    return { 
      sub: payload.id, 
      name: payload.name, 
      email: payload.email, 
    };
  }
}