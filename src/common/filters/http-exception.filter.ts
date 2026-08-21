import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

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
      timestamp: new Date().toISOString(),
    });
  }
}
