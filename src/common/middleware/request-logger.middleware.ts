import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Loga uma linha por requisição: método, rota, status e duração.
 *
 * É middleware — e não interceptor — de propósito: middleware roda antes dos
 * guards, e o evento 'finish' dispara depois que a resposta saiu. Isso cobre
 * respostas que nunca chegam ao controller (401 do JwtAuthGuard, 400 do
 * ValidationPipe, 404 de rota inexistente), que um interceptor não enxergaria.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const inicio = Date.now();

    res.on('finish', () => {
      const duracao = Date.now() - inicio;

      // Só metadados: body e header Authorization carregam senha e token,
      // e o log vai parar no stdout do Railway.
      const linha = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duracao}ms`;

      if (res.statusCode >= 500) {
        this.logger.error(linha);
      } else if (res.statusCode >= 400) {
        // warn deixa os 4xx visíveis: o HttpExceptionFilter responde sem logar nada.
        this.logger.warn(linha);
      } else {
        this.logger.log(linha);
      }
    });

    next();
  }
}
