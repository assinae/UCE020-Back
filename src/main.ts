import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './modules/app/app.module';
import { setupSwagger } from './config/swagger.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Aumenta o limite de payload para 50MB
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Prefixo global — todas as rotas ficam em /api/v1/...
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  // Shape padronizado de erros — sem isso cada throw retorna um formato diferente
  app.useGlobalFilters(new HttpExceptionFilter());

  // Shape padronizado de sucesso — { data: ..., statusCode: 200 }
  app.useGlobalInterceptors(new ResponseInterceptor());

  // CORS — só aceita requisições do frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
    exposedHeaders: ['X-Certificate-Default-Texts'],
  });

  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
