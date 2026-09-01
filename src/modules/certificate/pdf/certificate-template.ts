type CertificateTemplateInput = {
  templateUrl?: string | null;
  certificadoTemplate?: string | null;
  template?: string | null;
};

function isValidTemplateCandidate(value?: string | null): boolean {
  if (!value) return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    return ['http:', 'https:', 'data:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function resolveCertificateTemplateUrl(
  input: CertificateTemplateInput,
): string | null {
  const candidates = [
    input.templateUrl,
    input.certificadoTemplate,
    input.template,
  ];

  const valid = candidates.find(isValidTemplateCandidate);
  return valid ? valid.trim() : null;
}
