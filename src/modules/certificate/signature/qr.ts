// src/modules/certificate/signature/qr.ts

// Assinatura mínima do que usamos do pacote `qrcode`, para não depender de
// @types/qrcode e manter a tipagem segura (sem `any`).
type QrCodeToBuffer = (
  text: string,
  options: {
    type: 'png';
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: { dark?: string; light?: string };
  },
) => Promise<Buffer>;

/**
 * Gera o PNG do QR Code com a URL de verificação.
 * Import dinâmico + try/catch para degradar sem quebrar caso o pacote falte.
 */
export async function gerarQrPng(texto: string): Promise<Buffer | null> {
  try {
    const mod = (await import('qrcode')) as unknown as {
      toBuffer: QrCodeToBuffer;
    };

    return await mod.toBuffer(texto, {
      type: 'png',
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#0F1D35ff',
        light: '#ffffffff',
      },
    });
  } catch {
    return null;
  }
}
