import express from 'express';
import { criarRotasLinks } from './rotas/links.js';
import { criarRotaRedirecionamento } from './rotas/redirecionamento.js';
import { naoEncontrado, tratadorErros } from './middlewares/erros.js';

/**
 * Cria a aplicação Express (banco e configuração injetados — testável).
 * @param {import('better-sqlite3').Database} db
 * @param {{ urlBase?: string }} config urlBase: domínio público usado nas URLs curtas
 */
export function criarApp(db, config = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/saude', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/links', criarRotasLinks(db, config));
  // Por último: "/:codigo" captura qualquer caminho de um segmento.
  app.use(criarRotaRedirecionamento(db));

  app.use(naoEncontrado);
  app.use(tratadorErros);
  return app;
}
