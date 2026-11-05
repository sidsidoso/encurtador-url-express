import { ErroHttp } from './erros.js';
import { REGEX_CODIGO } from '../servicos/codigo.js';

/** Recusa códigos em formato impossível antes de consultar o banco. */
export function validarCodigo(req, res, next) {
  if (!REGEX_CODIGO.test(req.params.codigo)) {
    return next(new ErroHttp(404, 'Link não encontrado'));
  }
  next();
}
