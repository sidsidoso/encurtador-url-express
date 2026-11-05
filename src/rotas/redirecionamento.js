import { Router } from 'express';
import { ErroHttp } from '../middlewares/erros.js';
import { validarCodigo } from '../middlewares/codigo.js';

/** GET /:codigo → 302 para a URL original, contabilizando o acesso. */
export function criarRotaRedirecionamento(db) {
  const sql = {
    // Um único UPDATE localiza o link pelo índice de "codigo", incrementa o
    // contador e devolve a URL (RETURNING) — sem SELECT separado.
    contarAcesso: db.prepare(`
      UPDATE links
      SET acessos = acessos + 1,
          ultimo_acesso_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE codigo = ?
      RETURNING id, url`),
    contarDia: db.prepare(`
      INSERT INTO acessos_diarios (link_id, dia, total) VALUES (?, date('now'), 1)
      ON CONFLICT (link_id, dia) DO UPDATE SET total = total + 1`),
  };

  // Os dois contadores são atualizados juntos ou nenhum é (atomicidade).
  const registrarAcesso = db.transaction((codigo) => {
    const link = sql.contarAcesso.get(codigo);
    if (link) sql.contarDia.run(link.id);
    return link;
  });

  const router = Router();
  router.get('/:codigo', validarCodigo, (req, res) => {
    const link = registrarAcesso(req.params.codigo);
    if (!link) throw new ErroHttp(404, 'Link não encontrado');
    // Sem cache no navegador/proxy: cada visita passa pelo servidor e é contada.
    res.set('Cache-Control', 'private, no-store');
    res.redirect(302, link.url);
  });
  return router;
}
