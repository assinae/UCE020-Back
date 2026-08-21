import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

const BAHIA_TIME_ZONE = 'America/Bahia';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    const body = exception.getResponse() as string | Record<string, unknown>;

    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String(body.message)
        : exception.message;

    response.status(status).json({
      statusCode: status,
      error: message,
      path: request.url,
      timestamp: new Intl.DateTimeFormat('sv-SE', {
        timeZone: BAHIA_TIME_ZONE,
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date()),
    });
  }
}
