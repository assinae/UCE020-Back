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

export type ParticipantCertificateData = {
  certificateId: number;
  participantName: string;
  role: string;
  eventName: string;
  // Quando o certificado se refere a uma atividade específica (e não ao evento
  // como um todo), ajusta os textos do corpo ("participou da atividade" etc.).
  contextLabel?: 'evento' | 'atividade';
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
    data: string; // data/hora formatada
    codigo: string;
    qr?: { data: Buffer; format: 'png' };
  };
};

const ROLE_CERT_TITLE: Record<string, string> = {
  Ouvinte: 'CERTIFICADO DE PARTICIPAÇÃO',
  Monitor: 'CERTIFICADO DE MONITORIA',
  Organizador: 'CERTIFICADO DE ORGANIZAÇÃO',
};

function buildRoleVerb(
  role: string,
  contextLabel: 'evento' | 'atividade',
): string {
  const label = contextLabel === 'atividade' ? 'atividade' : 'evento';
  const preposition = contextLabel === 'atividade' ? 'da' : 'do';
  const article = contextLabel === 'atividade' ? 'na' : 'no';

  const verbs: Record<string, string> = {
    Ouvinte: `participou ${preposition} ${label}`,
    Monitor: `atuou como monitor ${article} ${label}`,
    Organizador: `atuou como organizador ${preposition} ${label}`,
  };

  return verbs[role] ?? verbs.Ouvinte;
}

function buildDocument(data: ParticipantCertificateData) {
  const e = React.createElement;
  const certTitle = ROLE_CERT_TITLE[data.role] ?? 'CERTIFICADO DE PARTICIPAÇÃO';
  const roleVerb = buildRoleVerb(data.role, data.contextLabel ?? 'evento');
  const hasTemplate = Boolean(data.templateUrl);
  const templateSrc = hasTemplate && data.templateUrl ? data.templateUrl : null;
  const renderDefaultBranding = shouldRenderDefaultBranding(data.templateUrl);

  if (hasTemplate && templateSrc) {
    return e(
      Document,
      {},
      e(
        Page,
        { size: 'A4', orientation: 'landscape', style: styles.page },
        e(Image, {
          src: templateSrc,
          style: styles.templateBackground,
        }),
        e(
          View,
          {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              paddingTop: 42,
              paddingHorizontal: 48,
              paddingBottom: 18,
              justifyContent: 'space-between',
            },
          },
          e(
            View,
            {
              style: {
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 14,
              },
            },
            e(
              Text,
              {
                style: {
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 2,
                  color: '#0F1D35',
                  textAlign: 'center',
                },
              },
              certTitle,
            ),
            e(
              Text,
              {
                style: {
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#0F1D35',
                  textAlign: 'center',
                  marginTop: 6,
                },
              },
              data.eventName,
            ),
          ),
          e(
            View,
            {
              style: {
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 10,
              },
            },
            e(
              Text,
              {
                style: {
                  fontSize: 12,
                  fontWeight: 400,
                  letterSpacing: 2,
                  color: '#0F1D35',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                },
              },
              'Certificamos que',
            ),
            e(
              Text,
              {
                style: {
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#0F1D35',
                  textAlign: 'center',
                  marginBottom: 10,
                },
              },
              data.participantName,
            ),
            e(
              Text,
              {
                style: {
                  fontSize: 11,
                  color: '#1F2937',
                  textAlign: 'center',
                  lineHeight: 1.7,
                },
              },
              `${roleVerb} `,
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
                      style: {
                        fontSize: 11,
                        color: '#1F2937',
                        textAlign: 'center',
                        marginTop: 4,
                      },
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
                    ' pela participação.',
                  ),
                ]
              : []),
            e(
              View,
              {
                style: {
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginTop: 12,
                  gap: 12,
                },
              },
              e(
                View,
                { style: { alignItems: 'center' } },
                e(
                  Text,
                  {
                    style: {
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      color: '#475467',
                      textTransform: 'uppercase',
                    },
                  },
                  'Local',
                ),
                e(
                  Text,
                  {
                    style: {
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#0F1D35',
                      textAlign: 'center',
                    },
                  },
                  data.location,
                ),
              ),
              e(
                View,
                { style: { alignItems: 'center' } },
                e(
                  Text,
                  {
                    style: {
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      color: '#475467',
                      textTransform: 'uppercase',
                    },
                  },
                  'Período',
                ),
                e(
                  Text,
                  {
                    style: {
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#0F1D35',
                      textAlign: 'center',
                    },
                  },
                  data.eventDate,
                ),
              ),
              ...(data.workloadHours
                ? [
                    e(
                      View,
                      { style: { alignItems: 'center' } },
                      e(
                        Text,
                        {
                          style: {
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: 1.5,
                            color: '#475467',
                            textTransform: 'uppercase',
                          },
                        },
                        'Carga Horária',
                      ),
                      e(
                        Text,
                        {
                          style: {
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#0F1D35',
                            textAlign: 'center',
                          },
                        },
                        `${data.workloadHours}h`,
                      ),
                    ),
                  ]
                : []),
            ),
          ),
          e(
            View,
            {
              style: {
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginTop: 8,
              },
            },
            data.assinatura
              ? e(
                  View,
                  {
                    style: {
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                    },
                  },
                  data.assinatura.qr
                    ? e(Image, {
                        src: data.assinatura.qr,
                        style: { width: 56, height: 56, objectFit: 'contain' },
                      })
                    : null,
                  e(
                    View,
                    { style: { alignItems: 'center' } },
                    e(
                      Text,
                      { style: { fontSize: 8, color: '#475467' } },
                      'Assinado digitalmente por',
                    ),
                    e(
                      Text,
                      {
                        style: {
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#0F1D35',
                        },
                      },
                      data.assinatura.nome,
                    ),
                    e(
                      Text,
                      { style: { fontSize: 7.5, color: '#475467' } },
                      `em ${data.assinatura.data}`,
                    ),
                    e(
                      Text,
                      { style: { fontSize: 7, color: '#64748B' } },
                      `Código de verificação: ${data.assinatura.codigo}`,
                    ),
                  ),
                )
              : null,
          ),
          e(
            View,
            {
              style: {
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 8,
                borderTopWidth: 1,
                borderTopColor: '#D1D5DB',
                marginTop: 10,
                fontSize: 8,
                color: '#475467',
              },
            },
            e(
              Text,
              { style: { flex: 1, textAlign: 'left' } },
              `Emitido em ${formatDate(data.issueDate)}`,
            ),
            e(
              Text,
              { style: { flex: 1.4, textAlign: 'center' } },
              'Universidade Estadual de Feira de Santana — UEFS',
            ),
            e(
              Text,
              { style: { flex: 1, textAlign: 'right' } },
              `Certificado nº ${data.certificateId}`,
            ),
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

        renderDefaultBranding
          ? e(
              View,
              { style: styles.headerSection },
              e(Image, { src: LOGO_ASSINAE_SRC, style: styles.logo }),
            )
          : null,

        e(
          View,
          { style: styles.certTypeSection },
          e(Text, { style: styles.certTypeLabel }, certTitle),
          e(Text, { style: styles.eventName }, data.eventName),
        ),

        e(
          View,
          { style: styles.bodySection },
          e(Text, { style: styles.certificamosQue }, 'Certificamos que'),
          e(Text, { style: styles.participantName }, data.participantName),
          e(
            Text,
            { style: styles.descriptionText },
            `${roleVerb} `,
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
                  ' pela participação.',
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

        renderDefaultBranding
          ? e(
              View,
              { style: styles.apoioSection },
              e(Text, { style: styles.apoioLabel }, 'Apoio:'),
              e(Image, { src: LOGO_UEFS_SRC, style: styles.apoioLogo }),
            )
          : null,

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

export async function renderParticipantCertificatePdf(
  data: ParticipantCertificateData,
): Promise<Buffer> {
  const stream = await pdf(buildDocument(data)).toBuffer();
  return streamToBuffer(stream);
}
