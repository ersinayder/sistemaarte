/**
 * Middleware global de erro do Express.
 * Sanitiza mensagens internas do SQLite/better-sqlite3
 * para nao vazar detalhes do schema ao cliente.
 *
 * Uso: app.use(errorHandler) — APOS todas as rotas.
 */

const IS_DEV = process.env.NODE_ENV !== 'production';

// Mapeia padroes de erro do SQLite para mensagens seguras
function sanitizarErroSQLite(msg) {
  if (!msg) return null;

  if (/UNIQUE constraint failed/i.test(msg)) {
    if (/ordens\.numero/i.test(msg))    return 'Numero de OS duplicado. Tente novamente.';
    if (/users\.username/i.test(msg))   return 'Nome de usuario ja em uso.';
    if (/clientes/i.test(msg))          return 'Registro duplicado em clientes.';
    return 'Registro duplicado.';
  }

  if (/NOT NULL constraint failed/i.test(msg)) {
    const campo = msg.split('.')[1] || 'campo obrigatorio';
    return `Campo obrigatorio ausente: ${campo}.`;
  }

  if (/FOREIGN KEY constraint failed/i.test(msg))
    return 'Referencia invalida. Verifique os dados e tente novamente.';

  if (/CHECK constraint failed/i.test(msg))
    return 'Valor fora do permitido para este campo.';

  if (/database is locked/i.test(msg))
    return 'Banco de dados temporariamente ocupado. Tente novamente em instantes.';

  if (/no such table|no such column/i.test(msg))
    return 'Erro interno de configuracao. Contate o suporte.';

  // Outros erros do SQLite — log interno, mensagem generica ao cliente
  if (/SqliteError|SQLITE_/i.test(msg))
    return 'Erro interno ao processar a operacao.';

  return null; // nao e erro SQLite conhecido
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status  = err.status || err.statusCode || 500;
  const raw     = err.message || '';

  // Loga sempre no servidor com contexto
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${status} — ${raw}`);
  if (IS_DEV && err.stack) console.error(err.stack);

  const sanitizado = sanitizarErroSQLite(raw);

  // Em producao: nunca expoe mensagem crua de erro interno
  const mensagem = sanitizado
    || (status < 500 ? raw : null)  // erros 4xx podem ter msg do proprio codigo
    || 'Erro interno do servidor.';

  res.status(status).json({ error: mensagem });
}

module.exports = { errorHandler };
