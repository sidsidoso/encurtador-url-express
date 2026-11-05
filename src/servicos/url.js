export const TAMANHO_MAXIMO_URL = 2048;
const PROTOCOLOS_PERMITIDOS = new Set(['http:', 'https:']);

/**
 * Valida e normaliza a URL de destino.
 * Aceita apenas http/https (bloqueia javascript:, data:, file:, ftp: ...)
 * e recusa credenciais embutidas (https://usuario:senha@host), comuns em phishing.
 * @returns {{ url?: string, erro?: string }}
 */
export function validarUrl(entrada) {
  if (typeof entrada !== 'string') return { erro: 'deve ser um texto' };
  const texto = entrada.trim();
  if (texto.length === 0) return { erro: 'campo obrigatório' };
  if (texto.length > TAMANHO_MAXIMO_URL) return { erro: `deve ter no máximo ${TAMANHO_MAXIMO_URL} caracteres` };

  let url;
  try {
    url = new URL(texto);
  } catch {
    return { erro: 'URL inválida' };
  }
  if (!PROTOCOLOS_PERMITIDOS.has(url.protocol)) return { erro: 'apenas URLs http ou https são permitidas' };
  if (!url.hostname) return { erro: 'URL sem domínio' };
  if (url.username || url.password) return { erro: 'URLs com usuário/senha embutidos não são permitidas' };

  const normalizada = url.href;
  if (normalizada.length > TAMANHO_MAXIMO_URL) return { erro: `deve ter no máximo ${TAMANHO_MAXIMO_URL} caracteres` };
  return { url: normalizada };
}
