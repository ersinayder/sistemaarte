const { getDB } = require("../database");
const { toNumber } = require("../utils/numbers");

function formatMoney(val) {
  return Number(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = String(dateStr).slice(0, 10).split("-");
  if (d.length === 3) return `${d[2]}/${d[1]}`;
  return dateStr;
}

function createClienteAcertoService({ db = getDB() } = {}) {
  function getContaEmAberto(clienteId) {
    const cliente = db.prepare("SELECT * FROM clientes WHERE id=? AND deletedat IS NULL").get(clienteId);
    if (!cliente) throw new Error("Cliente não encontrado.");

    const ordens = db
      .prepare(
        `SELECT o.*
         FROM ordens o
         WHERE o.clienteid = ? AND o.status = 'Entregue' AND o.deletedat IS NULL
         ORDER BY o.createdat ASC, o.id ASC`
      )
      .all(clienteId);

    const ordensComSaldo = [];
    let totalCentavos = 0;

    for (const o of ordens) {
      const lancRow = db
        .prepare(
          `SELECT COALESCE(SUM(valor), 0) AS total
           FROM lancamentos
           WHERE ordemid = ? AND pago = 1 AND deletedat IS NULL`
        )
        .get(o.id);

      const recebido = toNumber(lancRow?.total, 0);
      const total = toNumber(o.valortotal, 0);
      const saldo = Math.max(0, Math.round((total - recebido) * 100) / 100);

      if (saldo > 0.01) {
        totalCentavos += Math.round(saldo * 100);
        ordensComSaldo.push({
          ...o,
          recebido,
          saldo,
        });
      }
    }

    return {
      cliente,
      ordens: ordensComSaldo,
      totalEmAberto: Math.round(totalCentavos) / 100,
    };
  }

  function receberAcerto({ clienteId, pagamento, ordem_ids, valor_total_esperado, usuarioId }) {
    if (!pagamento) throw new Error("Forma de pagamento é obrigatória.");

    return db.transaction(() => {
      const conta = getContaEmAberto(clienteId);
      if (conta.ordens.length === 0) {
        throw new Error("Cliente não possui ordens em aberto.");
      }

      const totalEsperadoCent = Math.round(toNumber(valor_total_esperado, 0) * 100);
      const totalRealCent = Math.round(conta.totalEmAberto * 100);

      if (Math.abs(totalEsperadoCent - totalRealCent) > 1) {
        throw new Error("Valores divergentes: a conta do cliente foi atualizada recentemente.");
      }

      // Cria registro de acerto
      const acerto = db
        .prepare(
          `INSERT INTO cliente_acertos (
            clienteid, valor_total, pagamento, criadopor
          ) VALUES (?, ?, ?, ?)`
        )
        .run(clienteId, conta.totalEmAberto, pagamento, usuarioId);

      const acertoId = acerto.lastInsertRowid;

      // Cria lançamento individual de saldo para cada OS
      for (const o of conta.ordens) {
        const desc = `Acerto de contas OS ${o.numero} - ${o.servico}`;
        db.prepare(
          `INSERT INTO lancamentos (
            data, tipo, categoria, descricao, pagamento, valor, pago,
            ordemid, clienteid, criadopor, origem, acerto_id
          ) VALUES (
            datetime('now','localtime'), 'Entrada', 'Acerto de contas', ?, ?, ?, 1,
            ?, ?, ?, 'saldoos', ?
          )`
        ).run(desc, pagamento, o.saldo, o.id, clienteId, usuarioId, acertoId);
      }

      return {
        ok: true,
        acertoId,
        totalPago: conta.totalEmAberto,
        ordensAfetadas: conta.ordens.length,
      };
    })();
  }

  function estornarAcerto({ acertoId, usuarioId }) {
    return db.transaction(() => {
      const acerto = db.prepare("SELECT * FROM cliente_acertos WHERE id=?").get(acertoId);
      if (!acerto) throw new Error("Acerto não encontrado.");
      if (acerto.estornado_em) throw new Error("Este acerto já foi estornado.");

      // Soft-delete de todos os lançamentos criados por este acerto
      db.prepare(
        `UPDATE lancamentos
         SET deletedat = datetime('now','localtime'), deletedpor = ?
         WHERE acerto_id = ? AND deletedat IS NULL`
      ).run(usuarioId, acertoId);

      // Marca acerto como estornado
      db.prepare(
        `UPDATE cliente_acertos
         SET estornado_em = datetime('now','localtime'), estornado_por = ?
         WHERE id = ?`
      ).run(usuarioId, acertoId);

      return { ok: true };
    })();
  }

  function gerarMensagemCobranca({ clienteId }) {
    const { cliente, ordens, totalEmAberto } = getContaEmAberto(clienteId);
    let empresa = null;
    try {
      empresa = db.prepare("SELECT nomefantasia, chave_pix FROM empresa_config WHERE id=1").get();
    } catch (_) {}

    const nomeLoja = empresa?.nomefantasia || "Arte e Molduras";
    const chavePix = empresa?.chave_pix;

    const linhas = [];
    linhas.push(`Olá, ${cliente.name}! Segue o resumo da sua conta na ${nomeLoja}:`);
    linhas.push("");

    for (const o of ordens) {
      const dataStr = formatDate(o.createdat);
      const dataPart = dataStr ? ` – ${dataStr}` : "";
      linhas.push(`OS ${o.numero}${dataPart} – ${o.servico} – R$ ${formatMoney(o.valortotal)}${o.recebido > 0 ? ` (saldo: R$ ${formatMoney(o.saldo)})` : ""}`);
    }

    linhas.push("");
    linhas.push(`Total em aberto: R$ ${formatMoney(totalEmAberto)}`);
    if (chavePix) {
      linhas.push(`Pix: ${chavePix}`);
    }

    const texto = linhas.join("\n");
    const cleanPhone = String(cliente.phone || "").replace(/\D/g, "");
    const encoded = encodeURIComponent(texto);

    return {
      texto,
      telefone: cleanPhone,
      urlWhatsAppWeb: cleanPhone ? `https://wa.me/55${cleanPhone}?text=${encoded}` : "",
      urlWhatsAppApp: cleanPhone ? `whatsapp://send?phone=55${cleanPhone}&text=${encoded}` : "",
    };
  }

  return {
    getContaEmAberto,
    receberAcerto,
    estornarAcerto,
    gerarMensagemCobranca,
  };
}

module.exports = { createClienteAcertoService };
