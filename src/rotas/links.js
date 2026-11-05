import { Router } from 'express';
import { ErroHttp } from '../middlewares/erros.js';
import { validarCorpo } from '../middlewares/validacao.js';
import { validarCodigo } from '../middlewares/codigo.js';
import { gerarCodigo, codigoReservado, REGEX_CODIGO } from '../servicos/codigo.js';
import { validarUrl, TAMANHO_MAXIMO_URL } from '../servicos/url.js';

const MAX_TENTATIVAS = 5;
const DIAS_ESTATISTICA = 30;
const LIMITE_MAXIMO = 100;

const COLUNAS = `codigo, url, personalizado, acessos,
  criado_em AS criadoEm, ultimo_acesso_em AS ultimoAcessoEm`;

const esquemaLink = {
  url: { tipo: 'texto', obrigatorio: true, max: TAMANHO_MAXIMO_URL },
  codigo: {
    tipo: 'texto',
    padrao: REGEX_CODIGO,
    mensagemPadrao: 'use de 3 a 32 caracteres entre letras, números, "-" e "_"',
  },
};

/** Lê um inteiro da query string dentro de um intervalo. */
function inteiroDaQuery(valor, padrao, min, max, nome) {
  if (valor === undefined) return padrao;
  const n = Number(valor);
  if (typeof valor !== 'string' || !Number.isInteger(n) || n < min || n > max) {
    throw new ErroHttp(400, `Parâmetro ${nome} deve ser um inteiro entre ${min} e ${max}`);
  }
  return n;
}

/** API de gerenciamento dos links (prefixo /api/links). */
export function criarRotasLinks(db, config) {
  const sql = {
    inserir: db.prepare(`
      INSERT INTO links (codigo, url, personalizado) VALUES (?, ?, ?)
      RETURNING ${COLUNAS}`),
    buscar: db.prepare(`SELECT id, ${COLUNAS} FROM links WHERE codigo = ?`),
    listar: db.prepare(`SELECT ${COLUNAS} FROM links ORDER BY id DESC LIMIT ? OFFSET ?`),
    contar: db.prepare('SELECT COUNT(*) AS total FROM links'),
    porDia: db.prepare(`
      SELECT dia, total AS acessos FROM acessos_diarios
      WHERE link_id = ? AND dia >= date('now', ?)
      ORDER BY dia`),
  };

  /** URL curta absoluta: usa BASE_URL se configurada, senão o host da requisição. */
  const urlCurta = (req, codigo) => `${config.urlBase ?? `${req.protocol}://${req.get('host')}`}/${codigo}`;
  const formatar = (req, link) => ({ ...link, personalizado: link.personalizado === 1, urlCurta: urlCurta(req, link.codigo) });

  function buscarOu404(codigo) {
    const link = sql.buscar.get(codigo);
    if (!link) throw new ErroHttp(404, 'Link não encontrado');
    return link;
  }

  const router = Router();

  router.post('/', validarCorpo(esquemaLink), (req, res) => {
    const { url, erro } = validarUrl(req.dados.url);
    if (erro) throw new ErroHttp(400, 'Dados inválidos', [{ campo: 'url', mensagem: erro }]);

    const personalizado = req.dados.codigo;
    if (personalizado !== undefined) {
      if (codigoReservado(personalizado)) throw new ErroHttp(409, `O código "${personalizado}" é reservado`);
      try {
        const link = sql.inserir.get(personalizado, url, 1);
        return res.status(201).location(`${req.baseUrl}/${link.codigo}`).json(formatar(req, link));
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new ErroHttp(409, `O código "${personalizado}" já está em uso`);
        throw err;
      }
    }

    // Código aleatório: em caso (raríssimo) de colisão, a restrição UNIQUE
    // avisa e tentamos outro código — sem SELECT prévio, sem condição de corrida.
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
      const codigo = gerarCodigo();
      if (codigoReservado(codigo)) continue;
      try {
        const link = sql.inserir.get(codigo, url, 0);
        return res.status(201).location(`${req.baseUrl}/${link.codigo}`).json(formatar(req, link));
      } catch (err) {
        if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
      }
    }
    throw new ErroHttp(503, 'Não foi possível gerar um código único, tente novamente');
  });

  router.get('/', (req, res) => {
    const pagina = inteiroDaQuery(req.query.pagina, 1, 1, Number.MAX_SAFE_INTEGER, 'pagina');
    const limite = inteiroDaQuery(req.query.limite, 20, 1, LIMITE_MAXIMO, 'limite');
    const { total } = sql.contar.get();
    const dados = sql.listar.all(limite, (pagina - 1) * limite).map((l) => formatar(req, l));
    res.json({ dados, paginacao: { pagina, limite, total, totalPaginas: Math.ceil(total / limite) } });
  });

  router.get('/:codigo', validarCodigo, (req, res) => {
    const { id, ...link } = buscarOu404(req.params.codigo);
    res.json(formatar(req, link));
  });

  router.get('/:codigo/estatisticas', validarCodigo, (req, res) => {
    const { id, ...link } = buscarOu404(req.params.codigo);
    const porDia = sql.porDia.all(id, `-${DIAS_ESTATISTICA - 1} days`);
    res.json({
      codigo: link.codigo,
      url: link.url,
      acessos: link.acessos,
      criadoEm: link.criadoEm,
      ultimoAcessoEm: link.ultimoAcessoEm,
      periodoDias: DIAS_ESTATISTICA,
      acessosPorDia: porDia,
    });
  });

  return router;
}
