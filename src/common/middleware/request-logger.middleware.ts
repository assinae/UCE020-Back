import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Loga uma linha por requisição: método, rota, status e duração.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const inicio = Date.now();

    res.on('finish', () => {
      const duracao = Date.now() - inicio;
      const linha = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duracao}ms`;

      if (res.statusCode >= 500) {
        this.logger.error(linha);
      } else if (res.statusCode >= 400) {
        this.logger.warn(linha);
      } else {
        this.logger.log(linha);
      }
    });

    next();
  }
}
