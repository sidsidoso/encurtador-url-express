import { abrirBanco } from './db.js';
import { criarApp } from './app.js';

// Carrega o .env se existir (recurso nativo do Node, sem dependências).
try {
  process.loadEnvFile();
} catch {
  // sem .env: usa apenas as variáveis do ambiente
}

const porta = Number(process.env.PORT) || 3000;
// Em produção defina BASE_URL: assim as URLs curtas não dependem do cabeçalho Host.
const urlBase = process.env.BASE_URL?.replace(/\/+$/, '') || undefined;

const db = abrirBanco(process.env.DB_PATH || 'encurtador.db');
const servidor = criarApp(db, { urlBase }).listen(porta, () => {
  console.log(`Encurtador ouvindo em http://localhost:${porta}`);
});

function encerrar() {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
