import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarServidor } from './auxiliar.js';
import { gerarCodigo, ALFABETO_BASE62 } from '../src/servicos/codigo.js';
import { validarUrl } from '../src/servicos/url.js';

describe('gerador de códigos base62', () => {
  it('gera códigos de 7 caracteres do alfabeto base62', () => {
    for (let i = 0; i < 500; i++) {
      const codigo = gerarCodigo();
      assert.equal(codigo.length, 7);
      assert.ok([...codigo].every((c) => ALFABETO_BASE62.includes(c)));
    }
  });

  it('não repete códigos em 10 mil gerações', () => {
    const codigos = new Set(Array.from({ length: 10_000 }, () => gerarCodigo()));
    assert.equal(codigos.size, 10_000);
  });
});

describe('validação de URL', () => {
  it('aceita http e https e normaliza', () => {
    assert.deepEqual(validarUrl('  HTTPS://Exemplo.com.br  '), { url: 'https://exemplo.com.br/' });
    assert.ok(validarUrl('http://localhost:8080/a?b=1#c').url);
  });

  it('recusa outros protocolos, textos inválidos e credenciais embutidas', () => {
    for (const entrada of ['javascript:alert(1)', 'data:text/html,oi', 'ftp://exemplo.com', 'file:///etc/passwd', 'exemplo.com', '', 'https://usuario:senha@exemplo.com']) {
      assert.ok(validarUrl(entrada).erro, entrada);
    }
    assert.ok(validarUrl(`https://exemplo.com/${'a'.repeat(2048)}`).erro);
  });
});

describe('API do encurtador', () => {
  let api;
  before(async () => {
    api = await iniciarServidor();
  });
  after(() => api.fechar());

  describe('criação', () => {
    it('encurta uma URL com código aleatório (201)', async () => {
      const { status, corpo } = await api.req('POST', '/api/links', { url: 'https://nodejs.org/api/test.html' });
      assert.equal(status, 201);
      assert.match(corpo.codigo, /^[0-9A-Za-z]{7}$/);
      assert.equal(corpo.personalizado, false);
      assert.equal(corpo.acessos, 0);
      assert.equal(corpo.urlCurta, `${api.base}/${corpo.codigo}`);
    });

    it('aceita código personalizado', async () => {
      const { status, corpo, headers } = await api.req('POST', '/api/links', { url: 'https://expressjs.com', codigo: 'express-5' });
      assert.equal(status, 201);
      assert.equal(corpo.codigo, 'express-5');
      assert.equal(corpo.personalizado, true);
      assert.equal(headers.get('location'), '/api/links/express-5');
    });

    it('recusa código personalizado já usado ou reservado (409)', async () => {
      assert.equal((await api.req('POST', '/api/links', { url: 'https://a.com', codigo: 'express-5' })).status, 409);
      assert.equal((await api.req('POST', '/api/links', { url: 'https://a.com', codigo: 'API' })).status, 409);
    });

    it('recusa código personalizado com formato inválido (400)', async () => {
      for (const codigo of ['ab', 'com espaço', 'a/b', 'x'.repeat(33), 'ação']) {
        const { status } = await api.req('POST', '/api/links', { url: 'https://a.com', codigo });
        assert.equal(status, 400, codigo);
      }
    });

    it('recusa URL perigosa ou inválida (400)', async () => {
      for (const url of ['javascript:alert(document.cookie)', 'nao-e-url', 'ftp://arquivos.com']) {
        const { status, corpo } = await api.req('POST', '/api/links', { url });
        assert.equal(status, 400, url);
        assert.equal(corpo.detalhes[0].campo, 'url');
      }
    });

    it('recusa corpo sem url e campos desconhecidos (400)', async () => {
      const { status, corpo } = await api.req('POST', '/api/links', { destino: 'https://a.com' });
      assert.equal(status, 400);
      assert.deepEqual(corpo.detalhes.map((d) => d.campo).sort(), ['destino', 'url']);
    });

    it('usa BASE_URL configurada para montar a URL curta', async () => {
      const outra = await iniciarServidor({ urlBase: 'https://encurta.dor' });
      try {
        const { corpo } = await outra.req('POST', '/api/links', { url: 'https://a.com', codigo: 'base' });
        assert.equal(corpo.urlCurta, 'https://encurta.dor/base');
      } finally {
        await outra.fechar();
      }
    });
  });

  describe('redirecionamento e estatísticas', () => {
    before(async () => {
      await api.req('POST', '/api/links', { url: 'https://www.sqlite.org/wal.html', codigo: 'wal' });
    });

    it('redireciona com 302 para a URL original, sem cache', async () => {
      const { status, headers } = await api.req('GET', '/wal');
      assert.equal(status, 302);
      assert.equal(headers.get('location'), 'https://www.sqlite.org/wal.html');
      assert.equal(headers.get('cache-control'), 'private, no-store');
    });

    it('conta cada acesso e registra o dia', async () => {
      await api.req('GET', '/wal');
      await api.req('GET', '/wal');
      const { status, corpo } = await api.req('GET', '/api/links/wal/estatisticas');
      assert.equal(status, 200);
      assert.equal(corpo.acessos, 3);
      assert.ok(corpo.ultimoAcessoEm);
      assert.equal(corpo.periodoDias, 30);
      assert.equal(corpo.acessosPorDia.length, 1);
      assert.equal(corpo.acessosPorDia[0].acessos, 3);
      assert.equal(corpo.acessosPorDia[0].dia, new Date().toISOString().slice(0, 10));
    });

    it('consulta os detalhes de um link', async () => {
      const { status, corpo } = await api.req('GET', '/api/links/wal');
      assert.equal(status, 200);
      assert.equal(corpo.url, 'https://www.sqlite.org/wal.html');
      assert.equal(corpo.id, undefined);
    });

    it('responde 404 para código inexistente ou inválido', async () => {
      assert.equal((await api.req('GET', '/naoExiste')).status, 404);
      assert.equal((await api.req('GET', '/favicon.ico')).status, 404);
      assert.equal((await api.req('GET', '/api/links/naoExiste/estatisticas')).status, 404);
    });

    it('lista os links com paginação', async () => {
      const { status, corpo } = await api.req('GET', '/api/links?limite=2');
      assert.equal(status, 200);
      assert.equal(corpo.dados.length, 2);
      assert.equal(corpo.paginacao.total, 3);
      assert.equal(corpo.dados[0].codigo, 'wal'); // mais recente primeiro
      assert.equal((await api.req('GET', '/api/links?limite=500')).status, 400);
    });
  });

  it('responde 400 para JSON malformado e não expõe X-Powered-By', async () => {
    const resposta = await fetch(`${api.base}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"url":',
    });
    assert.equal(resposta.status, 400);
    assert.equal(resposta.headers.get('x-powered-by'), null);
  });
});
