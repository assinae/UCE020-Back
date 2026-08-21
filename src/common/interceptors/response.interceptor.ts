import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';
import { serializeBahiaDates } from 'src/common/helpers/bahia-date.helper';

interface ResponseShape<T> {
  data: T;
  message?: string;
  statusCode: number;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ResponseShape<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ResponseShape<T>> {
    const statusCode = context
      .switchToHttp()
      .getResponse<Response>().statusCode;

    return next.handle().pipe(
      map((body) => {
        const responseBody = body as Record<string, unknown>;

        if (
          responseBody &&
          typeof responseBody === 'object' &&
          'message' in responseBody &&
          'data' in responseBody
        ) {
          return {
            statusCode,
            message: String(responseBody.message),
            data: serializeBahiaDates(responseBody.data) as T,
          };
        }

        return {
          statusCode,
          data: serializeBahiaDates(body) as T,
        };
      }),
    );
  }
}
