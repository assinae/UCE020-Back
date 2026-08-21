// src/modules/certificate/certificate.module.ts
import { Module } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { AuthModule } from '../auth/auth.module';
import { CertificateRepository } from './repository/certificate.respository';
import { CertificateFileStorageService } from './storage/certificate-file-storage.service';
import { SupabaseStorageModule } from 'src/common/storage/supabase-storage.module';
import { CertificateMeController } from './controller/certificate-me.controller';
import { CertificateController } from './controller/certificate.controller';
import { CertificateGuestController } from './controller/certificate-guest.controller';
import { CertificateParticipantController } from './controller/certificate-participant.controller';
import { CertificatePdfController } from './controller/certificate-pdf.controller';
import { CertificateDetailController } from './controller/certificate-detail.controller';
import { CertificatePdfService } from './certificate-pdf.service';
import { CertificateSignatureService } from './signature/certificate-signature.service';
import { CertificateSignatureController } from './signature/certificate-signature.controller';
import { CertificateVerificationController } from './signature/certificate-verification.controller';

@Module({
  imports: [AuthModule, SupabaseStorageModule],
  // A ordem importa: rotas mais específicas primeiro. CertificateMeController
  // (`certificate/me`) e CertificatePdfController (`certificate/:id/pdf`) ficam
  // antes de CertificateDetailController (`certificate/:id`) para não serem
  // capturados como um id.
  controllers: [
    CertificateController,
    CertificateGuestController,
    CertificateParticipantController,
    CertificateMeController,
    CertificatePdfController,
    CertificateDetailController,
    CertificateSignatureController,
    CertificateVerificationController,
  ],
  providers: [
    CertificateService,
    CertificatePdfService,
    CertificateRepository,
    CertificateFileStorageService,
    CertificateSignatureService,
  ],
})
export class CertificateModule {}
