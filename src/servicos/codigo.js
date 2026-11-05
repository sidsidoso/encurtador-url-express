import { randomBytes } from 'node:crypto';

export const ALFABETO_BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const TAMANHO_CODIGO = 7; // 62^7 ≈ 3,5 trilhões de combinações

// Códigos personalizados: letras, dígitos, "-" e "_", de 3 a 32 caracteres.
export const REGEX_CODIGO = /^[A-Za-z0-9_-]{3,32}$/;
// Palavras que colidiriam com rotas da própria aplicação.
const RESERVADOS = new Set(['api', 'saude']);

// Maior múltiplo de 62 que cabe em um byte (62 * 4 = 248). Bytes >= 248 são
// descartados para que cada caractere tenha exatamente a mesma probabilidade
// (amostragem por rejeição, sem o viés do operador módulo).
const LIMITE_SEM_VIES = 248;

/** Gera um código base62 aleatório e criptograficamente seguro. */
export function gerarCodigo(tamanho = TAMANHO_CODIGO) {
  let codigo = '';
  while (codigo.length < tamanho) {
    for (const byte of randomBytes(tamanho * 2)) {
      if (byte < LIMITE_SEM_VIES) codigo += ALFABETO_BASE62[byte % 62];
      if (codigo.length === tamanho) break;
    }
  }
  return codigo;
}

export function codigoReservado(codigo) {
  return RESERVADOS.has(codigo.toLowerCase());
}

