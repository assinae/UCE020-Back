import { certificateStyles } from './certificate.styles';
import { resolveCertificateTemplateUrl } from './certificate-template';
import { baseUrlVerificacao } from '../signature/signature-format';

export type CertificateLayoutSource = {
  templateUrl?: string | null;
  certificadoTemplate?: string | null;
  template?: string | null;
  assinante1Nome?: string | null;
  assinante1Titulo?: string | null;
  assinante2Nome?: string | null;
  assinante2Titulo?: string | null;
  certificadoTitulo?: string | null;
  certificadoSubtitulo?: string | null;
  certificadoDescricaoInicio?: string | null;
  certificadoDescricaoEvento?: string | null;
  certificadoDescricaoCargaHoraria?: string | null;
};

export type CertificateLayoutSnapshot = {
  templateUrl: string | null;
  verificationUrlBase: string | null;
  styles: Record<string, Record<string, unknown>>;
  signers: {
    primaryName: string | null;
    primaryTitle: string | null;
    secondaryName: string | null;
    secondaryTitle: string | null;
  };
  texts: {
    title: string | null;
    subtitle: string | null;
    descriptionStart: string | null;
    descriptionEvent: string | null;
    descriptionWorkload: string | null;
  };
};

/** Captura dados visuais e personalizados efetivos no momento do encerramento. */
export function createCertificateLayoutSnapshot(
  event: CertificateLayoutSource,
): CertificateLayoutSnapshot {
  return {
    templateUrl: resolveCertificateTemplateUrl(event),
    verificationUrlBase: baseUrlVerificacao(),
    styles: JSON.parse(JSON.stringify(certificateStyles)) as Record<
      string,
      Record<string, unknown>
    >,
    signers: {
      primaryName: event.assinante1Nome ?? null,
      primaryTitle: event.assinante1Titulo ?? null,
      secondaryName: event.assinante2Nome ?? null,
      secondaryTitle: event.assinante2Titulo ?? null,
    },
    texts: {
      title: event.certificadoTitulo ?? null,
      subtitle: event.certificadoSubtitulo ?? null,
      descriptionStart: event.certificadoDescricaoInicio ?? null,
      descriptionEvent: event.certificadoDescricaoEvento ?? null,
      descriptionWorkload: event.certificadoDescricaoCargaHoraria ?? null,
    },
  };
}
