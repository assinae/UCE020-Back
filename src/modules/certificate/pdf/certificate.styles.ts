import { StyleSheet } from '@react-pdf/renderer';
import { Font } from '@react-pdf/renderer';
import { join } from 'path';

/**
 * Relativo a __dirname, não ao cwd: o nest-cli.json copia os .ttf para
 * dist/src/resources/fonts, e é de lá que este arquivo compilado precisa ler.
 * Com process.cwd() a leitura só funcionava se a pasta src/ original também
 * estivesse no runtime — e falhava com ENOENT, sem fallback, derrubando todo
 * download de certificado. Mesmo padrão de certificate.assets.ts.
 */
const FONTS_DIR = join(__dirname, '..', '..', '..', 'resources', 'fonts');

Font.register({
  family: 'Poppins',
  fonts: [
    {
      src: join(FONTS_DIR, 'Poppins-Regular.ttf'),
      fontWeight: 400,
    },
    {
      src: join(FONTS_DIR, 'Poppins-Bold.ttf'),
      fontWeight: 700,
    },
    {
      src: join(FONTS_DIR, 'Poppins-Italic.ttf'),
      fontWeight: 400,
      fontStyle: 'italic',
    },
  ],
});

export const certificateStyles = StyleSheet.create({
  page: {
    position: 'relative',
    padding: 0,
    fontFamily: 'Poppins',
    backgroundColor: '#ffffff',
  },

  templateBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 841.89,
    height: 595,
    objectFit: 'cover',
  },

  templateContent: {
    position: 'absolute',
    top: 250,
    left: 64,
    right: 64,
    height: 250,
    alignItems: 'center',
  },

  templateCertTypeLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#24134B',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 10,
  },

  templateBodySection: {
    alignItems: 'center',
    width: '100%',
  },

  templateEventName: {
    fontSize: 11,
    fontWeight: 700,
    color: '#24134B',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 1.2,
  },

  templateCertificamosQue: {
    fontSize: 9,
    fontWeight: 700,
    color: '#64748B',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 10,
  },

  templateParticipantName: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0F1D35',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 1.15,
  },

  templateDescriptionText: {
    fontSize: 9,
    fontWeight: 400,
    color: '#475467',
    textAlign: 'center',
    lineHeight: 1.45,
    maxWidth: 520,
  },

  templateDetailsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 14,
    gap: 20,
  },

  templateDetailBlock: {
    alignItems: 'center',
    minWidth: 70,
  },

  templateDetailLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: '#64748B',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  templateDetailValue: {
    fontSize: 8,
    fontWeight: 700,
    color: '#0F1D35',
    textAlign: 'center',
  },

  templateSignatureArea: {
    position: 'absolute',
    left: 250,
    bottom: 66,
    width: 280,
    height: 96,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  templateFooterSection: {
    position: 'absolute',
    left: 64,
    right: 64,
    bottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  templateFooterLeft: {
    flex: 1,
    textAlign: 'left',
    fontSize: 5,
    fontWeight: 400,
    color: '#64748B',
  },

  templateFooterCenter: {
    flex: 1.5,
    textAlign: 'center',
    fontSize: 5,
    fontWeight: 400,
    color: '#64748B',
  },

  templateFooterRight: {
    flex: 1,
    textAlign: 'right',
    fontSize: 5,
    fontWeight: 400,
    color: '#64748B',
  },

  // Borda externa com cantos decorativos — linha verde
  outerBorder: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    bottom: 18,
    borderWidth: 2,
    borderColor: '#2EC4A0',
    borderStyle: 'solid',
  },

  // Canto superior esquerdo
  cornerTL: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 24,
    height: 24,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopColor: '#0F1D35',
    borderLeftColor: '#0F1D35',
  },
  // Canto superior direito
  cornerTR: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopColor: '#0F1D35',
    borderRightColor: '#0F1D35',
  },
  // Canto inferior esquerdo
  cornerBL: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    width: 24,
    height: 24,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomColor: '#0F1D35',
    borderLeftColor: '#0F1D35',
  },
  // Canto inferior direito
  cornerBR: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 24,
    height: 24,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomColor: '#0F1D35',
    borderRightColor: '#0F1D35',
  },

  // Container principal
  content: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    paddingHorizontal: 64,
    paddingTop: 32,
    paddingBottom: 28,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Header — logo
  headerSection: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 4,
  },

  logo: {
    width: 140,
    height: 56,
    objectFit: 'contain',
  },

  // Tipo do certificado + nome do evento
  certTypeSection: {
    alignItems: 'center',
    width: '100%',
  },

  certTypeLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#0F1D35',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },

  eventName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#2EC4A0',
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 1.3,
  },

  // Corpo central
  bodySection: {
    alignItems: 'center',
    width: '100%',
  },

  certificamosQue: {
    fontSize: 10,
    fontWeight: 400,
    color: '#64748B',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
  },

  participantName: {
    fontSize: 28,
    fontWeight: 700,
    color: '#0F1D35',
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    lineHeight: 1.2,
  },

  descriptionText: {
    fontSize: 11,
    fontWeight: 400,
    color: '#475467',
    textAlign: 'center',
    lineHeight: 1.8,
    maxWidth: 500,
  },

  descriptionBold: {
    fontWeight: 700,
    color: '#0F1D35',
  },

  // Linha de detalhes — local, período, carga horária
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },

  detailBlock: {
    alignItems: 'center',
  },

  detailLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: '#94A3B8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  detailValue: {
    fontSize: 10,
    fontWeight: 700,
    color: '#0F1D35',
    textAlign: 'center',
  },

  detailSeparator: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },

  // Assinatura digital — área central reservada (onde antes ficavam as linhas).
  // Quando o certificado é assinado, o bloco abaixo é renderizado centralizado.
  signatureArea: {
    width: '100%',
    height: 96,
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bloco de assinatura centralizado: QR + (logo, "assinado por", nome, data, código)
  signatureStamp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },

  signatureQr: {
    width: 64,
    height: 64,
    objectFit: 'contain',
  },

  signatureInfo: {
    alignItems: 'flex-start',
  },

  signatureLogo: {
    width: 82,
    height: 26,
    objectFit: 'contain',
    marginBottom: 3,
  },

  signatureLabel: {
    fontSize: 7.5,
    fontWeight: 400,
    color: '#64748B',
  },

  signatureName: {
    fontSize: 12,
    fontWeight: 700,
    color: '#0F1D35',
    lineHeight: 1.3,
  },

  signatureDate: {
    fontSize: 8.5,
    fontWeight: 400,
    color: '#64748B',
  },

  signatureCode: {
    fontSize: 7.5,
    fontWeight: 400,
    color: '#94A3B8',
  },

  // Seção fixa de Apoio (logo UEFS)
  apoioSection: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 4,
  },

  apoioLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: '#94A3B8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  apoioLogo: {
    width: 90,
    height: 32,
    objectFit: 'contain',
  },

  // Rodapé
  footerSection: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#E2E8F0',
  },

  footerLeft: {
    flex: 1,
    textAlign: 'left',
    fontSize: 8,
    fontWeight: 400,
    color: '#94A3B8',
  },

  footerCenter: {
    flex: 1.5,
    textAlign: 'center',
    fontSize: 8,
    fontWeight: 400,
    color: '#94A3B8',
  },

  footerRight: {
    flex: 1,
    textAlign: 'right',
    fontSize: 8,
    fontWeight: 400,
    color: '#CBD5E1',
  },
});
