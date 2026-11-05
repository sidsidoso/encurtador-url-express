import Database from 'better-sqlite3';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS links (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo           TEXT    NOT NULL UNIQUE,  -- UNIQUE cria o índice usado no redirecionamento
  url              TEXT    NOT NULL CHECK (length(url) <= 2048),
  personalizado    INTEGER NOT NULL DEFAULT 0 CHECK (personalizado IN (0, 1)),
  acessos          INTEGER NOT NULL DEFAULT 0,
  criado_em        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ultimo_acesso_em TEXT
);

-- Contador agregado por dia: uma linha por (link, dia) em vez de uma por acesso.
CREATE TABLE IF NOT EXISTS acessos_diarios (
  link_id INTEGER NOT NULL REFERENCES links (id) ON DELETE CASCADE,
  dia     TEXT    NOT NULL, -- AAAA-MM-DD (UTC)
  total   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (link_id, dia)
) WITHOUT ROWID;
`;

/**
 * Abre (ou cria) o banco SQLite e garante o esquema.
 * @param {string} caminho arquivo do banco ou ':memory:' (testes)
 */
export function abrirBanco(caminho = ':memory:') {
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(ESQUEMA);
  return db;
}
