/**
 * Cache LRU dos PDFs já renderizados, limitado por bytes.
 *
 * A chave é o hash do conteúdo impresso, não o id do certificado: qualquer
 * mudança no que aparece no papel — reassinatura, renome do evento, troca de
 * assinante — produz uma chave nova, e a entrada antiga apenas envelhece até
 * ser despejada. Isso dispensa invalidação explícita, que é onde esse tipo de
 * cache costuma errar.
 */
export class PdfCache {
  private readonly entradas = new Map<string, Buffer>();
  private bytesUsados = 0;

  constructor(private readonly limiteBytes: number) {}

  get(chave: string): Buffer | undefined {
    const buffer = this.entradas.get(chave);
    if (!buffer) return undefined;

    // Map preserva ordem de inserção: reinserir joga a entrada para o fim e a
    // marca como a mais recente. A primeira chave é sempre a mais antiga.
    this.entradas.delete(chave);
    this.entradas.set(chave, buffer);

    return buffer;
  }

  set(chave: string, buffer: Buffer): void {
    if (buffer.length > this.limiteBytes) return;

    const existente = this.entradas.get(chave);
    if (existente) {
      this.entradas.delete(chave);
      this.bytesUsados -= existente.length;
    }

    this.entradas.set(chave, buffer);
    this.bytesUsados += buffer.length;

    while (this.bytesUsados > this.limiteBytes) {
      const maisAntiga = this.entradas.keys().next();
      if (maisAntiga.done) break;

      const despejado = this.entradas.get(maisAntiga.value)!;
      this.entradas.delete(maisAntiga.value);
      this.bytesUsados -= despejado.length;
    }
  }

  get estatisticas() {
    return { entradas: this.entradas.size, bytesUsados: this.bytesUsados };
  }
}
