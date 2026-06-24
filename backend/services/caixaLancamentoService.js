const { descricaoRestanteOS } = require("../domain/ordensRules");
const {
  centavos,
  contribuicaoRecebida,
  ordensAfetadas,
  projetarSaldoCentavos,
} = require("../domain/ordemPagamentoRules");
const { toNumber } = require("../utils/numbers");

function appError(status, message, code = null) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function bind(params = []) {
  return Array.isArray(params) ? params : [params];
}

function queryOne(db, sql, params = []) {
  return db.prepare(sql).get(...bind(params)) ?? null;
}

function execRun(db, sql, params = []) {
  return db.prepare(sql).run(...bind(params));
}

function runTransaction(db, fn) {
  const tx = db.transaction(fn);
  if (typeof tx.immediate === "function") return tx.immediate();
  return tx();
}

function normalizarOrdemId(ordemid) {
  if (!ordemid) return null;
  return ordemid;
}

function buscarOrdemAtiva(db, ordemId) {
  return queryOne(
    db,
    `SELECT id, status, valortotal, numero, clientenome, servico
       FROM ordens
      WHERE id=? AND deletedat IS NULL`,
    [ordemId]
  );
}

function totalRecebidoAtual(db, ordemId) {
  const row = queryOne(
    db,
    `SELECT COALESCE(SUM(valor),0) AS total
       FROM lancamentos
      WHERE ordemid=? AND pago=1 AND deletedat IS NULL`,
    [ordemId]
  );
  return toNumber(row?.total);
}

function saldoDisponivelCentavos({ ordem, recebidoAtual, antigo }) {
  const recebidoSemLancamentoAtual =
    centavos(recebidoAtual)
    - (Number(antigo?.ordemid) === Number(ordem.id) ? contribuicaoRecebida(antigo) : 0);

  return Math.max(0, centavos(ordem.valortotal) - recebidoSemLancamentoAtual);
}

function createCaixaLancamentoService({ db }) {
  if (!db) throw new Error("db e obrigatorio");

  function editar(id, patch, user) {
    return runTransaction(db, () => {
      const old = queryOne(db, "SELECT * FROM lancamentos WHERE id=? AND deletedat IS NULL", [id]);
      if (!old) throw appError(404, "Lancamento nao encontrado.");

      if (old.origem === "entradaos" && user?.role !== "admin") {
        throw appError(400, "A entrada vinculada a OS deve ser alterada pela propria OS.");
      }

      const {
        data,
        tipo,
        categoria,
        descricao,
        pagamento,
        valor,
        pago,
        ordemid,
      } = patch ?? {};

      if (old.origem === "entradaos" && user?.role === "admin") {
        execRun(
          db,
          "UPDATE lancamentos SET data=COALESCE(?,data), pagamento=COALESCE(?,pagamento) WHERE id=?",
          [data || null, pagamento || null, id]
        );
        return { ok: true };
      }

      const novoOrdemId = normalizarOrdemId(ordemid);
      const nValor = toNumber(valor);
      let origem = novoOrdemId ? "saldoos" : "manual";
      let descFinal = descricao;
      let categoriaFinal = categoria || null;
      let tipoFinal = novoOrdemId ? "Entrada" : (tipo || "Diversos");
      let pagoFinal = novoOrdemId ? 1 : (pago ? 1 : 0);
      let ordemNova = null;

      if (novoOrdemId) {
        ordemNova = buscarOrdemAtiva(db, novoOrdemId);
        if (!ordemNova) throw appError(404, "OS vinculada nao encontrada.");

        if (!(nValor > 0)) {
          throw appError(400, "Recebimento de saldo deve ter valor maior que zero.");
        }

        const recebidoAtual = totalRecebidoAtual(db, ordemNova.id);
        const disponivel = saldoDisponivelCentavos({
          ordem: ordemNova,
          recebidoAtual,
          antigo: old,
        });
        if (centavos(nValor) > disponivel) {
          throw appError(
            400,
            `Saldo disponivel para ${ordemNova.numero}: R$ ${(disponivel / 100).toFixed(2)}`
          );
        }

        descFinal = descricaoRestanteOS(ordemNova.numero, ordemNova.clientenome, ordemNova.servico);
        categoriaFinal = categoria || "Pagamento OS";
      }

      const novo = {
        ...old,
        data,
        tipo: tipoFinal,
        categoria: categoriaFinal,
        descricao: descFinal,
        pagamento,
        valor: nValor,
        pago: pagoFinal,
        ordemid: novoOrdemId,
        origem,
        deletedat: null,
      };

      for (const ordemId of ordensAfetadas(old, novo)) {
        const ordem = Number(ordemNova?.id) === Number(ordemId) ? ordemNova : buscarOrdemAtiva(db, ordemId);
        if (!ordem) {
          throw appError(404, "OS vinculada nao encontrada.", "os_nao_encontrada");
        }

        const saldoProjetado = projetarSaldoCentavos({
          total: ordem.valortotal,
          recebidoAtual: totalRecebidoAtual(db, ordem.id),
          antigo: old,
          novo,
          ordemId: ordem.id,
        });

        if (ordem.status === "Entregue" && saldoProjetado > 0) {
          throw appError(
            409,
            `Nao e possivel editar pagamento e deixar a ${ordem.numero} entregue com saldo em aberto. Reabra a OS ou mantenha a quitacao antes de alterar o caixa.`,
            "os_entregue_saldo_aberto"
          );
        }
      }

      execRun(
        db,
        "UPDATE lancamentos SET data=?,tipo=?,categoria=?,descricao=?,pagamento=?,valor=?,pago=?,ordemid=?,origem=? WHERE id=?",
        [data, tipoFinal, categoriaFinal, descFinal, pagamento, nValor, pagoFinal, novoOrdemId, origem, id]
      );

      return { ok: true };
    });
  }

  return { editar };
}

module.exports = { createCaixaLancamentoService };
