const Database = require("better-sqlite3");
const bcrypt    = require("bcryptjs");
const path      = require("path");
const fs        = require("fs");
const { buildBackupStatus, writeBackupStatus } = require("./utils/backupStatus");
const { encryptSecretIfPossible, isEncryptedSecret } = require("./utils/secrets");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE  = path.join(DATA_DIR, "oficina.db");
fs.mkdirSync(DATA_DIR, { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,
  username  TEXT    UNIQUE NOT NULL,
  password  TEXT    NOT NULL,
  role      TEXT    NOT NULL,
  active    INTEGER DEFAULT 1,
  createdat TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS clientes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  cpf        TEXT,
  ie         TEXT,
  logradouro TEXT,
  numero     TEXT,
  bairro     TEXT,
  cidade     TEXT,
  uf         TEXT,
  cep        TEXT,
  notes      TEXT,
  deletedat  TEXT    DEFAULT NULL,
  deletedpor INTEGER DEFAULT NULL,
  createdat  TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS ordens (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  numero            TEXT UNIQUE NOT NULL,
  clienteid         INTEGER,
  clientenome       TEXT NOT NULL,
  clientetelefone   TEXT,
  clientecpf        TEXT,
  servico           TEXT NOT NULL,
  descricao         TEXT,
  valortotal        REAL NOT NULL DEFAULT 0,
  valorentrada      REAL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'Aguardando',
  prioridade        TEXT DEFAULT 'Normal',
  prazoentrega      TEXT,
  pagamento         TEXT DEFAULT 'Pix',
  observacoes       TEXT,
  criadopor         INTEGER,
  deletedat         TEXT DEFAULT NULL,
  deletedpor        INTEGER DEFAULT NULL,
  deletedreason     TEXT DEFAULT NULL,
  createdat         TEXT DEFAULT (datetime('now','localtime')),
  updatedat         TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS lancamentos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  data      TEXT NOT NULL,
  tipo      TEXT NOT NULL DEFAULT 'Entrada',
  categoria TEXT DEFAULT NULL,
  descricao TEXT NOT NULL,
  pagamento TEXT NOT NULL,
  valor     REAL NOT NULL,
  pago      INTEGER DEFAULT 1,
  ordemid   INTEGER,
  criadopor INTEGER,
  origem    TEXT DEFAULT NULL,
  deletedat TEXT DEFAULT NULL,
  deletedpor INTEGER DEFAULT NULL,
  createdat TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS lancamento_itens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lancamentoid    INTEGER NOT NULL,
  produto_id      INTEGER DEFAULT NULL,
  nome            TEXT NOT NULL,
  quantidade      REAL NOT NULL DEFAULT 1,
  preco_unitario  REAL NOT NULL DEFAULT 0,
  subtotal        REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
  avulso          INTEGER DEFAULT 0,
  createdat       TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS statuslog (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ordemid        INTEGER,
  statusanterior TEXT,
  statusnovo     TEXT NOT NULL,
  usuarioid      INTEGER,
  obs            TEXT,
  createdat      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS produtos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT NOT NULL,
  categoria      TEXT DEFAULT 'Outros',
  unidade        TEXT DEFAULT 'un',
  preco          REAL DEFAULT 0,
  estoque        REAL DEFAULT 0,
  estoquemin     REAL DEFAULT 0,
  descricao      TEXT DEFAULT '',
  ncm            TEXT,
  cfop           TEXT DEFAULT '5102',
  csosn          TEXT DEFAULT '400',
  origem_fiscal  INTEGER DEFAULT 0,
  deletedat      TEXT DEFAULT NULL,
  deletedpor     INTEGER DEFAULT NULL,
  createdat      TEXT DEFAULT (datetime('now','localtime')),
  updatedat      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS ordem_itens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ordemid         INTEGER NOT NULL,
  produto_id      INTEGER DEFAULT NULL,
  nome            TEXT NOT NULL,
  quantidade      REAL NOT NULL DEFAULT 1,
  preco_unitario  REAL NOT NULL DEFAULT 0,
  subtotal        REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
  avulso          INTEGER DEFAULT 0,
  createdat       TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS propostas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  numero          TEXT UNIQUE,
  clienteid       INTEGER,
  clientenome     TEXT NOT NULL,
  clientetelefone TEXT,
  clientecpf      TEXT,
  status          TEXT NOT NULL DEFAULT 'Novo lead',
  origem          TEXT DEFAULT 'balcao',
  descricao       TEXT,
  valortotal      REAL NOT NULL DEFAULT 0,
  prazoentrega    TEXT,
  observacoes     TEXT,
  ordemid         INTEGER DEFAULT NULL,
  criadopor       INTEGER,
  enviadoem       TEXT,
  aprovadoem      TEXT,
  perdidoem       TEXT,
  createdat       TEXT DEFAULT (datetime('now','localtime')),
  updatedat       TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS proposta_itens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  propostaid      INTEGER NOT NULL,
  produto_id      INTEGER DEFAULT NULL,
  nome            TEXT NOT NULL,
  quantidade      REAL NOT NULL DEFAULT 1,
  preco_unitario  REAL NOT NULL DEFAULT 0,
  subtotal        REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
  avulso          INTEGER DEFAULT 0,
  createdat       TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS contas_pagar (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor    TEXT NOT NULL,
  descricao     TEXT NOT NULL,
  categoria     TEXT DEFAULT 'Outros',
  valor         REAL NOT NULL DEFAULT 0,
  vencimento    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Pendente',
  pagamento     TEXT,
  pagoem        TEXT,
  lancamentoid  INTEGER,
  observacoes   TEXT,
  criadopor     INTEGER,
  deletedat     TEXT DEFAULT NULL,
  deletedpor    INTEGER DEFAULT NULL,
  createdat     TEXT DEFAULT (datetime('now','localtime')),
  updatedat     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sequencias (
  nome   TEXT PRIMARY KEY,
  ultimo INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS empresa_config (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  razaosocial           TEXT,
  nomefantasia          TEXT,
  cnpj                  TEXT,
  inscricaoestadual     TEXT,
  crt                   TEXT DEFAULT '1',
  telefone              TEXT,
  email                 TEXT,
  logradouro            TEXT,
  numero                TEXT,
  bairro                TEXT,
  municipio             TEXT,
  codigomunicipio       TEXT,
  uf                    TEXT,
  cep                   TEXT,
  updatedat             TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO empresa_config (id) VALUES (1);
CREATE TABLE IF NOT EXISTS fiscal_config (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  ambiente              INTEGER DEFAULT 2,
  serie                 TEXT DEFAULT '1',
  configurado           INTEGER DEFAULT 0,
  certificado_path      TEXT,
  certificado_nome      TEXT,
  certificado_senha     TEXT,
  certificado_updatedat TEXT,
  updatedat             TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO fiscal_config (id) VALUES (1);
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  enabled               INTEGER DEFAULT 0,
  provider              TEXT DEFAULT 'meta',
  phone_id              TEXT,
  token                 TEXT,
  template_pronto       TEXT DEFAULT 'os_pronta',
  template_confirmacao  TEXT DEFAULT 'confirmacao_pedido',
  configurado           INTEGER DEFAULT 0,
  updatedat             TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO whatsapp_config (id) VALUES (1);
CREATE TABLE IF NOT EXISTS whatsapp_avisos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ordemid           INTEGER NOT NULL,
  tipo              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pendente',
  telefone_snapshot TEXT,
  mensagem_snapshot TEXT,
  aberto_por        INTEGER,
  enviado_por       INTEGER,
  ignorado_por      INTEGER,
  aberto_em         TEXT,
  enviado_em        TEXT,
  ignorado_em       TEXT,
  createdat         TEXT DEFAULT (datetime('now','localtime')),
  updatedat         TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(ordemid, tipo)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_avisos_ordemid ON whatsapp_avisos(ordemid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_avisos_status ON whatsapp_avisos(status);
CREATE INDEX IF NOT EXISTS idx_ordens_status       ON ordens(status);
CREATE INDEX IF NOT EXISTS idx_ordens_prazo        ON ordens(prazoentrega);
CREATE INDEX IF NOT EXISTS idx_ordens_clienteid    ON ordens(clienteid);
CREATE INDEX IF NOT EXISTS idx_lancamentos_data    ON lancamentos(data);
CREATE INDEX IF NOT EXISTS idx_lancamentos_ordemid ON lancamentos(ordemid);
CREATE INDEX IF NOT EXISTS idx_lancamento_itens_lancamentoid ON lancamento_itens(lancamentoid);
CREATE INDEX IF NOT EXISTS idx_statuslog_ordemid   ON statuslog(ordemid);
CREATE INDEX IF NOT EXISTS idx_produtos_nome       ON produtos(nome COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_ordem_itens_ordemid ON ordem_itens(ordemid);
CREATE INDEX IF NOT EXISTS idx_lancamentos_pago_del ON lancamentos(ordemid, pago, deletedat);
CREATE INDEX IF NOT EXISTS idx_propostas_status ON propostas(status);
CREATE INDEX IF NOT EXISTS idx_propostas_clienteid ON propostas(clienteid);
CREATE INDEX IF NOT EXISTS idx_proposta_itens_propostaid ON proposta_itens(propostaid);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON contas_pagar(status);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON contas_pagar(vencimento);
CREATE TABLE IF NOT EXISTS nfe_autxml (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL,
  documento TEXT NOT NULL,
  tipo      TEXT DEFAULT 'contador',
  ativo     INTEGER DEFAULT 1,
  createdat TEXT DEFAULT (datetime('now','localtime')),
  updatedat TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_nfe_autxml_documento ON nfe_autxml(documento);
CREATE INDEX IF NOT EXISTS idx_nfe_autxml_ativo ON nfe_autxml(ativo);
CREATE TABLE IF NOT EXISTS nfe_eventos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ordemid     INTEGER,
  chave       TEXT NOT NULL,
  tipo        TEXT NOT NULL,
  nseqevento  INTEGER NOT NULL DEFAULT 1,
  protocolo   TEXT,
  cstat       TEXT,
  motivo      TEXT,
  texto       TEXT,
  xml         TEXT,
  createdat   TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_nfe_eventos_chave_tipo ON nfe_eventos(chave, tipo);
CREATE INDEX IF NOT EXISTS idx_nfe_eventos_ordemid ON nfe_eventos(ordemid);
`;

let db;

function initDB() {
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const migrations = [
    // v1 — colunas adicionadas incrementalmente
    "ALTER TABLE ordens ADD COLUMN pagamento TEXT DEFAULT 'Pix'",
    "ALTER TABLE ordens ADD COLUMN prioridade TEXT DEFAULT 'Normal'",
    "ALTER TABLE ordens ADD COLUMN observacoes TEXT",
    "ALTER TABLE ordens ADD COLUMN updatedat TEXT DEFAULT (datetime('now','localtime'))",
    "ALTER TABLE ordens ADD COLUMN deletedat TEXT DEFAULT NULL",
    "ALTER TABLE ordens ADD COLUMN deletedpor INTEGER DEFAULT NULL",
    "ALTER TABLE ordens ADD COLUMN deletedreason TEXT DEFAULT NULL",
    "ALTER TABLE clientes ADD COLUMN ie TEXT",
    "ALTER TABLE clientes ADD COLUMN cidade TEXT",
    "ALTER TABLE clientes ADD COLUMN uf TEXT",
    "ALTER TABLE clientes ADD COLUMN cep TEXT",
    "ALTER TABLE clientes ADD COLUMN notes TEXT",
    "ALTER TABLE clientes ADD COLUMN deletedat TEXT DEFAULT NULL",
    "ALTER TABLE clientes ADD COLUMN deletedpor INTEGER DEFAULT NULL",
    "ALTER TABLE lancamentos ADD COLUMN origem TEXT DEFAULT NULL",
    "ALTER TABLE lancamentos ADD COLUMN pago INTEGER DEFAULT 1",
    "ALTER TABLE lancamentos ADD COLUMN deletedat TEXT DEFAULT NULL",
    "ALTER TABLE lancamentos ADD COLUMN deletedpor INTEGER DEFAULT NULL",
    "ALTER TABLE produtos ADD COLUMN deletedat TEXT DEFAULT NULL",
    "ALTER TABLE produtos ADD COLUMN deletedpor INTEGER DEFAULT NULL",
    // v2 — categoria em lancamentos
    "ALTER TABLE lancamentos ADD COLUMN categoria TEXT DEFAULT NULL",
    // v3 — índice composto saldo
    "CREATE INDEX IF NOT EXISTS idx_lancamentos_pago_del ON lancamentos(ordemid, pago, deletedat)",
    // v4 — campos fiscais NF-e em produtos e ordens
    "ALTER TABLE produtos ADD COLUMN ncm TEXT",
    "ALTER TABLE produtos ADD COLUMN cfop TEXT DEFAULT '5102'",
    "ALTER TABLE produtos ADD COLUMN csosn TEXT DEFAULT '400'",
    "ALTER TABLE produtos ADD COLUMN origem_fiscal INTEGER DEFAULT 0",
    "ALTER TABLE ordens ADD COLUMN nfe_numero TEXT",
    "ALTER TABLE ordens ADD COLUMN nfe_serie TEXT DEFAULT '1'",
    "ALTER TABLE ordens ADD COLUMN nfe_chave TEXT",
    "ALTER TABLE ordens ADD COLUMN nfe_protocolo TEXT",
    "ALTER TABLE ordens ADD COLUMN nfe_status TEXT",
    "ALTER TABLE ordens ADD COLUMN nfe_xml TEXT",
    "ALTER TABLE ordens ADD COLUMN nfe_emitida_em TEXT",
    // v5 — endereço estruturado em clientes
    "ALTER TABLE clientes ADD COLUMN logradouro TEXT",
    "ALTER TABLE clientes ADD COLUMN numero TEXT",
    "ALTER TABLE clientes ADD COLUMN bairro TEXT",
    // v5 — migrar dados legados: address -> logradouro
    "UPDATE clientes SET logradouro = address WHERE logradouro IS NULL AND address IS NOT NULL",
    // v6 — colunas de cancelamento de NF-e (adicionadas manualmente em 2026-05-14, commit 2691384)
    "ALTER TABLE ordens ADD COLUMN nfe_cancelado_em TEXT",
    "ALTER TABLE ordens ADD COLUMN nfe_cancel_protocolo TEXT",
    "ALTER TABLE ordens ADD COLUMN nfe_cancel_motivo TEXT",
    // v7 - eventos fiscais da NF-e (CC-e, cancelamento e futuros eventos)
    `CREATE TABLE IF NOT EXISTS nfe_eventos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ordemid     INTEGER,
      chave       TEXT NOT NULL,
      tipo        TEXT NOT NULL,
      nseqevento  INTEGER NOT NULL DEFAULT 1,
      protocolo   TEXT,
      cstat       TEXT,
      motivo      TEXT,
      texto       TEXT,
      xml         TEXT,
      createdat   TEXT DEFAULT (datetime('now','localtime'))
    )`,
    "CREATE INDEX IF NOT EXISTS idx_nfe_eventos_chave_tipo ON nfe_eventos(chave, tipo)",
    "CREATE INDEX IF NOT EXISTS idx_nfe_eventos_ordemid ON nfe_eventos(ordemid)",
    // v8 - marca quando fiscal_config foi salvo explicitamente pela tela/API
    "ALTER TABLE fiscal_config ADD COLUMN configurado INTEGER DEFAULT 0",
    // v9 - configuracao operacional do WhatsApp pela tela
    `CREATE TABLE IF NOT EXISTS whatsapp_config (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      enabled               INTEGER DEFAULT 0,
      provider              TEXT DEFAULT 'meta',
      phone_id              TEXT,
      token                 TEXT,
      template_pronto       TEXT DEFAULT 'os_pronta',
      template_confirmacao  TEXT DEFAULT 'confirmacao_pedido',
      configurado           INTEGER DEFAULT 0,
      updatedat             TEXT DEFAULT (datetime('now','localtime'))
    )`,
    "INSERT OR IGNORE INTO whatsapp_config (id) VALUES (1)",
    // v10 - propostas comerciais separadas das ordens de servico
    `CREATE TABLE IF NOT EXISTS propostas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      numero          TEXT UNIQUE,
      clienteid       INTEGER,
      clientenome     TEXT NOT NULL,
      clientetelefone TEXT,
      clientecpf      TEXT,
      status          TEXT NOT NULL DEFAULT 'Novo lead',
      origem          TEXT DEFAULT 'balcao',
      descricao       TEXT,
      valortotal      REAL NOT NULL DEFAULT 0,
      prazoentrega    TEXT,
      observacoes     TEXT,
      ordemid         INTEGER DEFAULT NULL,
      criadopor       INTEGER,
      enviadoem       TEXT,
      aprovadoem      TEXT,
      perdidoem       TEXT,
      createdat       TEXT DEFAULT (datetime('now','localtime')),
      updatedat       TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS proposta_itens (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      propostaid      INTEGER NOT NULL,
      produto_id      INTEGER DEFAULT NULL,
      nome            TEXT NOT NULL,
      quantidade      REAL NOT NULL DEFAULT 1,
      preco_unitario  REAL NOT NULL DEFAULT 0,
      subtotal        REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
      avulso          INTEGER DEFAULT 0,
      createdat       TEXT DEFAULT (datetime('now','localtime'))
    )`,
    "CREATE INDEX IF NOT EXISTS idx_propostas_status ON propostas(status)",
    "CREATE INDEX IF NOT EXISTS idx_propostas_clienteid ON propostas(clienteid)",
    "CREATE INDEX IF NOT EXISTS idx_proposta_itens_propostaid ON proposta_itens(propostaid)",
    // v11 - contas a pagar administrativas
    `CREATE TABLE IF NOT EXISTS contas_pagar (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor    TEXT NOT NULL,
      descricao     TEXT NOT NULL,
      categoria     TEXT DEFAULT 'Outros',
      valor         REAL NOT NULL DEFAULT 0,
      vencimento    TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'Pendente',
      pagamento     TEXT,
      pagoem        TEXT,
      lancamentoid  INTEGER,
      observacoes   TEXT,
      criadopor     INTEGER,
      deletedat     TEXT DEFAULT NULL,
      deletedpor    INTEGER DEFAULT NULL,
      createdat     TEXT DEFAULT (datetime('now','localtime')),
      updatedat     TEXT DEFAULT (datetime('now','localtime'))
    )`,
    "CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON contas_pagar(status)",
    "CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON contas_pagar(vencimento)",
    // v12 - itens estruturados de venda avulsa no caixa
    `CREATE TABLE IF NOT EXISTS lancamento_itens (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      lancamentoid    INTEGER NOT NULL,
      produto_id      INTEGER DEFAULT NULL,
      nome            TEXT NOT NULL,
      quantidade      REAL NOT NULL DEFAULT 1,
      preco_unitario  REAL NOT NULL DEFAULT 0,
      subtotal        REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
      avulso          INTEGER DEFAULT 0,
      createdat       TEXT DEFAULT (datetime('now','localtime'))
    )`,
    "CREATE INDEX IF NOT EXISTS idx_lancamento_itens_lancamentoid ON lancamento_itens(lancamentoid)",
    // v13 - avisos manuais de WhatsApp por OS
    `CREATE TABLE IF NOT EXISTS whatsapp_avisos (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      ordemid           INTEGER NOT NULL,
      tipo              TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pendente',
      telefone_snapshot TEXT,
      mensagem_snapshot TEXT,
      aberto_por        INTEGER,
      enviado_por       INTEGER,
      ignorado_por      INTEGER,
      aberto_em         TEXT,
      enviado_em        TEXT,
      ignorado_em       TEXT,
      createdat         TEXT DEFAULT (datetime('now','localtime')),
      updatedat         TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(ordemid, tipo)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_whatsapp_avisos_ordemid ON whatsapp_avisos(ordemid)",
    "CREATE INDEX IF NOT EXISTS idx_whatsapp_avisos_status ON whatsapp_avisos(status)",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) {}
  }

  // ── Tabela de sequências NF-e ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS nfe_sequencias (
      serie TEXT PRIMARY KEY,
      ultimo_numero INTEGER DEFAULT 0
    );
    INSERT OR IGNORE INTO nfe_sequencias (serie, ultimo_numero) VALUES ('1', 0);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS empresa_config (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      razaosocial           TEXT,
      nomefantasia          TEXT,
      cnpj                  TEXT,
      inscricaoestadual     TEXT,
      crt                   TEXT DEFAULT '1',
      telefone              TEXT,
      email                 TEXT,
      logradouro            TEXT,
      numero                TEXT,
      bairro                TEXT,
      municipio             TEXT,
      codigomunicipio       TEXT,
      uf                    TEXT,
      cep                   TEXT,
      updatedat             TEXT DEFAULT (datetime('now','localtime'))
    );
    INSERT OR IGNORE INTO empresa_config (id) VALUES (1);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS fiscal_config (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      ambiente              INTEGER DEFAULT 2,
      serie                 TEXT DEFAULT '1',
      configurado           INTEGER DEFAULT 0,
      certificado_path      TEXT,
      certificado_nome      TEXT,
      certificado_senha     TEXT,
      certificado_updatedat TEXT,
      updatedat             TEXT DEFAULT (datetime('now','localtime'))
    );
    INSERT OR IGNORE INTO fiscal_config (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS nfe_autxml (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nome      TEXT NOT NULL,
      documento TEXT NOT NULL,
      tipo      TEXT DEFAULT 'contador',
      ativo     INTEGER DEFAULT 1,
      createdat TEXT DEFAULT (datetime('now','localtime')),
      updatedat TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_nfe_autxml_documento ON nfe_autxml(documento);
    CREATE INDEX IF NOT EXISTS idx_nfe_autxml_ativo ON nfe_autxml(ativo);

    CREATE TABLE IF NOT EXISTS whatsapp_config (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      enabled               INTEGER DEFAULT 0,
      provider              TEXT DEFAULT 'meta',
      phone_id              TEXT,
      token                 TEXT,
      template_pronto       TEXT DEFAULT 'os_pronta',
      template_confirmacao  TEXT DEFAULT 'confirmacao_pedido',
      configurado           INTEGER DEFAULT 0,
      updatedat             TEXT DEFAULT (datetime('now','localtime'))
    );
    INSERT OR IGNORE INTO whatsapp_config (id) VALUES (1);
  `);

  // Normalizar status legados
  try {
    db.prepare("UPDATE ordens SET status='Aguardando' WHERE status='Recebido'").run();
    db.prepare("UPDATE ordens SET status='Cancelado' WHERE status='Cancelada'").run();
  } catch (_) {}

  // Corrigir lancamentos de entradaos com tipo inválido
  try {
    const fixed = db.prepare(
      "UPDATE lancamentos SET categoria=tipo, tipo='Entrada' WHERE origem='entradaos' AND tipo != 'Entrada' AND deletedat IS NULL"
    ).run();
    if (fixed.changes > 0)
      console.log(`[DB] Corrigidos ${fixed.changes} lancamento(s) entradaos com tipo invalido.`);
  } catch (_) {}

  // Corrigir recebimentos de saldo de OS com tipo invalido
  try {
    const fixed = db.prepare(
      "UPDATE lancamentos SET tipo='Entrada' WHERE origem='saldoos' AND tipo != 'Entrada' AND deletedat IS NULL"
    ).run();
    if (fixed.changes > 0)
      console.log(`[DB] Corrigidos ${fixed.changes} lancamento(s) saldoos com tipo invalido.`);
  } catch (_) {}

  try {
    const fiscal = db.prepare("SELECT certificado_senha FROM fiscal_config WHERE id = 1").get();
    if (fiscal?.certificado_senha && !isEncryptedSecret(fiscal.certificado_senha)) {
      const protegida = encryptSecretIfPossible(fiscal.certificado_senha);
      if (protegida && protegida !== fiscal.certificado_senha) {
        db.prepare("UPDATE fiscal_config SET certificado_senha=?, updatedat=datetime('now','localtime') WHERE id = 1")
          .run(protegida);
        console.log("[DB] Senha do certificado fiscal protegida em repouso.");
      }
    }
  } catch (e) {
    console.warn("[DB] Nao foi possivel proteger senha do certificado fiscal:", e.message);
  }

  // Seed sequencias
  db.prepare("INSERT OR IGNORE INTO sequencias (nome, ultimo) VALUES ('os', 0)").run();
  db.prepare("INSERT OR IGNORE INTO sequencias (nome, ultimo) VALUES ('proposta', 0)").run();
  const maxOS = db.prepare("SELECT MAX(CAST(SUBSTR(numero,4) AS INTEGER)) AS maxn FROM ordens").get();
  const maxN  = maxOS?.maxn ?? 0;
  db.prepare("UPDATE sequencias SET ultimo=MAX(ultimo,?) WHERE nome='os'").run(maxN);

  const isDevSeed = process.env.NODE_ENV === "development" || process.env.SEED_DEV === "1";
  if (isDevSeed) {
    const existing = db.prepare("SELECT id FROM users WHERE role=?").get("admin");
    if (!existing) {
      const stmt = db.prepare("INSERT INTO users (name,username,password,role) VALUES (?,?,?,?)");
      const seed = [
        ["Administrador","admin","admin123","admin"],
        ["Caixa","caixa","caixa123","caixa"],
        ["Oficina","oficina","oficina123","oficina"],
      ];
      for (const [name,username,pw,role] of seed) stmt.run(name, username, bcrypt.hashSync(pw,10), role);
      console.log("[DB] Usuarios padrao criados (somente dev)");
    }
  }
  console.log(`[DB] Banco inicializado: ${DB_FILE}`);
  return db;
}

const run       = (sql, params=[]) => db.prepare(sql).run(...(Array.isArray(params)?params:[params]));
const runInsert = (sql, params=[]) => db.prepare(sql).run(...(Array.isArray(params)?params:[params])).lastInsertRowid;
const getAll    = (sql, params=[]) => db.prepare(sql).all(...(Array.isArray(params)?params:[params]));
const getOne    = (sql, params=[]) => db.prepare(sql).get(...(Array.isArray(params)?params:[params])) ?? null;
const transaction = (fn) => db.transaction(fn)();

function backup() {
  const now  = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
  const bdir = path.join(DATA_DIR,"backups");
  fs.mkdirSync(bdir,{recursive:true});
  const dest = path.join(bdir,`backup-${now}.db`);
  return db.backup(dest).then(()=>{
    const files = fs.readdirSync(bdir).filter(f=>f.endsWith(".db")).sort();
    while (files.length > 7) fs.unlinkSync(path.join(bdir,files.shift()));
    const status = buildBackupStatus(bdir);
    writeBackupStatus(bdir, status);
    console.log("[Backup] Salvo:",dest);
    return { ok: true, arquivo: path.basename(dest), status };
  }).catch(e=>{
    const status = buildBackupStatus(bdir);
    status.status.status = "Pendente";
    status.status.missing = Array.from(new Set([...(status.status.missing || []), "backup-falhou"]));
    status.ultimoErro = {
      mensagem: e.message,
      createdat: new Date().toISOString(),
    };
    writeBackupStatus(bdir, status);
    console.error("[Backup] Erro:",e.message);
    throw e;
  });
}

module.exports = { initDB, run, runInsert, getAll, getOne, transaction, backup, getDB: () => db };
