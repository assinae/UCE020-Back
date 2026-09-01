import * as React from 'react';
import { Document, Page, Text, View, Image, pdf } from '@react-pdf/renderer';
import { streamToBuffer } from './stream-to-buffer';
import { certificateStyles as styles } from './certificate.styles';
import { formatDate } from './format-date-range';
import {
  LOGO_ASSINAE_SRC,
  LOGO_UEFS_SRC,
} from 'src/resources/certificatesConfig/certificate.assets';
import { shouldRenderDefaultBranding } from './certificate-template';

export type GuestCertificateData = {
  certificateId: number;
  guestName: string;
  role: string;
  eventName: string;
  activityName: string;
  workloadHours?: number | null;
  location: string;
  eventDate: string;
  issueDate: Date;
  assinante1Nome?: string;
  assinante1Titulo?: string;
  assinante2Nome?: string;
  assinante2Titulo?: string;
  templateUrl?: string | null;
  // Dados da assinatura digital (preenchidos no ato da assinatura).
  assinatura?: {
    nome: string;
    data: string;
    codigo: string;
    qr?: { data: Buffer; format: 'png' };
  };
};

const GUEST_CERT_TITLE: Record<string, string> = {
  Palestrante: 'CERTIFICADO DE PALESTRANTE',
  Ministrante: 'CERTIFICADO DE MINISTRANTE',
  Moderador: 'CERTIFICADO DE MODERADOR',
};

const GUEST_ROLE_VERB: Record<string, string> = {
  Palestrante: 'palestrou na atividade',
  Ministrante: 'ministrou a atividade',
  Moderador: 'moderou a atividade',
};

function buildDocument(data: GuestCertificateData) {
  const e = React.createElement;
  const certTitle =
    GUEST_CERT_TITLE[data.role] ?? 'CERTIFICADO DE PARTICIPAÇÃO';
  const roleVerb = GUEST_ROLE_VERB[data.role] ?? 'participou da atividade';
  const renderDefaultBranding = shouldRenderDefaultBranding(data.templateUrl);
  const hasTemplate = !renderDefaultBranding;
  const templateSrc =
    hasTemplate && data.templateUrl ? data.templateUrl.trim() : null;

  if (hasTemplate && templateSrc) {
    return e(
      Document,
      {},
      e(
        Page,
        {
          size: 'A4',
          orientation: 'landscape',
          style: styles.page,
          wrap: false,
        },
        e(Image, {
          src: templateSrc,
          style: styles.templateBackground,
        }),
        e(
          View,
          { style: styles.templateOverlay },
          e(Text, { style: styles.templateCertTypeLabel }, certTitle),
          e(Text, { style: styles.templateEventName }, data.eventName),
          e(
            Text,
            { style: styles.templateCertificamosQue },
            'Certificamos que',
          ),
          e(Text, { style: styles.templateParticipantName }, data.guestName),
          e(
            Text,
            { style: styles.templateDescriptionText },
            `${roleVerb} `,
            e(
              Text,
              { style: { fontWeight: 700, color: '#0F1D35' } },
              `"${data.activityName}"`,
            ),
            ', parte do evento ',
            e(
              Text,
              { style: { fontWeight: 700, color: '#0F1D35' } },
              `"${data.eventName}"`,
            ),
            data.workloadHours ? ', com carga horária de ' : '.',
          ),
          ...(data.workloadHours
            ? [
                e(
                  Text,
                  {
                    style: styles.templateDescriptionText,
                  },
                  e(
                    Text,
                    {
                      style: {
                        fontWeight: 700,
                        color: '#0F1D35',
                      },
                    },
                    `${data.workloadHours} hora(s)`,
                  ),
                  '.',
                ),
              ]
            : []),
          e(
            View,
            { style: styles.templateDetailsRow },
            e(
              View,
              { style: styles.templateDetailBlock },
              e(Text, { style: styles.templateDetailLabel }, 'Local'),
              e(Text, { style: styles.templateDetailValue }, data.location),
            ),
            e(
              View,
              { style: styles.templateDetailBlock },
              e(Text, { style: styles.templateDetailLabel }, 'Período'),
              e(Text, { style: styles.templateDetailValue }, data.eventDate),
            ),
            ...(data.workloadHours
              ? [
                  e(
                    View,
                    { style: styles.templateDetailBlock },
                    e(
                      Text,
                      { style: styles.templateDetailLabel },
                      'Carga Horária',
                    ),
                    e(
                      Text,
                      { style: styles.templateDetailValue },
                      `${data.workloadHours}h`,
                    ),
                  ),
                ]
              : []),
          ),
        ),
        e(
          View,
          { style: styles.templateSignatureArea },
          data.assinatura
            ? e(
                View,
                { style: styles.templateSignatureStamp },
                data.assinatura.qr
                  ? e(Image, {
                      src: data.assinatura.qr,
                      style: styles.templateSignatureQr,
                    })
                  : null,
                e(
                  View,
                  { style: styles.templateSignatureInfo },
                  e(
                    Text,
                    { style: styles.templateSignatureLabel },
                    'Assinado digitalmente por',
                  ),
                  e(
                    Text,
                    { style: styles.templateSignatureName },
                    data.assinatura.nome,
                  ),
                  e(
                    Text,
                    { style: styles.templateSignatureDate },
                    `em ${data.assinatura.data}`,
                  ),
                ),
              )
            : null,
        ),
        e(
          View,
          { style: styles.templateFooterSection },
          e(
            Text,
            { style: styles.templateFooterLeft },
            `Emitido em ${formatDate(data.issueDate)}`,
          ),
          e(
            Text,
            { style: styles.templateFooterCenter },
            'Universidade Estadual de Feira de Santana — UEFS',
          ),
          e(
            Text,
            { style: styles.templateFooterRight },
            `Certificado nº ${data.certificateId}`,
          ),
        ),
      ),
    );
  }

  return e(
    Document,
    {},
    e(
      Page,
      { size: 'A4', orientation: 'landscape', style: styles.page },

      e(View, { style: styles.outerBorder }),
      e(View, { style: styles.cornerTL }),
      e(View, { style: styles.cornerTR }),
      e(View, { style: styles.cornerBL }),
      e(View, { style: styles.cornerBR }),

      e(
        View,
        {
          style: styles.content,
        },

        // Logo
        renderDefaultBranding
          ? e(
              View,
              { style: styles.headerSection },
              e(Image, { src: LOGO_ASSINAE_SRC, style: styles.logo }),
            )
          : null,

        // Tipo + nome do evento
        e(
          View,
          { style: styles.certTypeSection },
          e(Text, { style: styles.certTypeLabel }, certTitle),
          e(Text, { style: styles.eventName }, data.eventName),
        ),

        // Corpo
        e(
          View,
          { style: styles.bodySection },
          e(Text, { style: styles.certificamosQue }, 'Certificamos que'),
          e(Text, { style: styles.participantName }, data.guestName),

          e(
            Text,
            { style: styles.descriptionText },
            `${roleVerb} `,
            e(
              Text,
              { style: styles.descriptionBold },
              `"${data.activityName}"`,
            ),
            ', parte do evento ',
            e(Text, { style: styles.descriptionBold }, `"${data.eventName}"`),
            data.workloadHours ? ', com carga horária de ' : '.',
          ),
          ...(data.workloadHours
            ? [
                e(
                  Text,
                  { style: styles.descriptionText },
                  e(
                    Text,
                    { style: styles.descriptionBold },
                    `${data.workloadHours} hora(s)`,
                  ),
                  '.',
                ),
              ]
            : []),

          e(
            View,
            { style: styles.detailsRow },
            e(
              View,
              { style: styles.detailBlock },
              e(Text, { style: styles.detailLabel }, 'Local'),
              e(Text, { style: styles.detailValue }, data.location),
            ),
            e(View, { style: styles.detailSeparator }),
            e(
              View,
              { style: styles.detailBlock },
              e(Text, { style: styles.detailLabel }, 'Período'),
              e(Text, { style: styles.detailValue }, data.eventDate),
            ),
            ...(data.workloadHours
              ? [
                  e(View, { style: styles.detailSeparator }),
                  e(
                    View,
                    { style: styles.detailBlock },
                    e(Text, { style: styles.detailLabel }, 'Carga Horária'),
                    e(
                      Text,
                      { style: styles.detailValue },
                      `${data.workloadHours}h`,
                    ),
                  ),
                ]
              : []),
          ),
        ),

        // Assinatura digital centralizada (onde antes ficavam as linhas).
        e(
          View,
          { style: styles.signatureArea },
          data.assinatura
            ? e(
                View,
                { style: styles.signatureStamp },
                data.assinatura.qr
                  ? e(Image, {
                      src: data.assinatura.qr,
                      style: styles.signatureQr,
                    })
                  : null,
                e(
                  View,
                  { style: styles.signatureInfo },
                  e(Image, {
                    src: LOGO_ASSINAE_SRC,
                    style: styles.signatureLogo,
                  }),
                  e(
                    Text,
                    { style: styles.signatureLabel },
                    'Assinado digitalmente por',
                  ),
                  e(
                    Text,
                    { style: styles.signatureName },
                    data.assinatura.nome,
                  ),
                  e(
                    Text,
                    { style: styles.signatureDate },
                    `em ${data.assinatura.data}`,
                  ),
                  e(
                    Text,
                    { style: styles.signatureCode },
                    `Código de verificação: ${data.assinatura.codigo}`,
                  ),
                ),
              )
            : null,
        ),

        // Apoio (fixa) — logo UEFS
        renderDefaultBranding
          ? e(
              View,
              { style: styles.apoioSection },
              e(Text, { style: styles.apoioLabel }, 'Apoio:'),
              e(Image, { src: LOGO_UEFS_SRC, style: styles.apoioLogo }),
            )
          : null,

        // Rodapé
        e(
          View,
          { style: styles.footerSection },
          e(
            Text,
            { style: styles.footerLeft },
            `Emitido em ${formatDate(data.issueDate)}`,
          ),
          e(
            Text,
            { style: styles.footerCenter },
            'Universidade Estadual de Feira de Santana — UEFS',
          ),
          e(
            Text,
            { style: styles.footerRight },
            `Certificado nº ${data.certificateId}`,
          ),
        ),
      ),
    ),
  );
}

export async function renderGuestCertificatePdf(
  data: GuestCertificateData,
): Promise<Buffer> {
  const stream = await pdf(buildDocument(data)).toBuffer();
  return streamToBuffer(stream);
}
