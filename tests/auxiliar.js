import { once } from 'node:events';
import { abrirBanco } from '../src/db.js';
import { criarApp } from '../src/app.js';

/** Sobe a API em uma porta livre (0) com banco em memória. */
export async function iniciarServidor(config = {}) {
  const db = abrirBanco(':memory:');
  const servidor = criarApp(db, config).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const base = `http://127.0.0.1:${servidor.address().port}`;

  /** Requisição sem seguir redirecionamentos, para inspecionar o 302. */
  async function req(metodo, caminho, corpo) {
    const resposta = await fetch(base + caminho, {
      method: metodo,
      redirect: 'manual',
      headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await resposta.text();
    const json = resposta.headers.get('content-type')?.includes('application/json');
    return { status: resposta.status, headers: resposta.headers, corpo: json && texto ? JSON.parse(texto) : texto };
  }

  async function fechar() {
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    db.close();
  }

  return { db, base, req, fechar };
}
