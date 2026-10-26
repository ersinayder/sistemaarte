const { getDB } = require("../database");
const { toNumber } = require("../utils/numbers");
const {
  calcularSaldoCredito,
  validarUsoCredito,
  centavos,
} = require("../domain/clienteCreditoRules");

function createClienteCreditoService({ db = getDB() } = {}) {
  function getExtratoCredito(clienteId) {
    const movimentos = db
      .prepare(
        `SELECT m.*, u.name AS usuarionome, o.numero AS ordemnumero
         FROM cliente_credito_movimentos m
         LEFT JOIN users u ON u.id = m.criadopor
         LEFT JOIN ordens o ON o.id = m.ordemid
         WHERE m.clienteid = ?
         ORDER BY m.createdat DESC, m.id DESC`
      )
      .all(clienteId);

    const saldo = calcularSaldoCredito(movimentos);
    return { saldo, movimentos };
  }

  function gerarCreditoPorExcedente({ ordemId, clienteId, valor, criadopor }) {
    const v = toNumber(valor, 0);
    if (v <= 0) throw new Error("Valor do crédito deve ser maior que zero.");

    return db.transaction(() => {
      // 1. Cria lançamento contábil CreditoLoja negativo para estornar receita da OS
      const lancamento = db
        .prepare(
          `INSERT INTO lancamentos (
            data, tipo, categoria, descricao, pagamento, valor, pago, ordemid, clienteid, criadopor, origem
          ) VALUES (
            datetime('now','localtime'), 'Entrada', 'Crédito gerado OS',
            'Crédito gerado por alteração/cancelamento de OS', 'CreditoLoja', ?, 1, ?, ?, ?, 'credito_gerado'
          )`
        )
        .run(-Math.abs(v), ordemId || null, clienteId, criadopor);

      const lancamentoId = lancamento.lastInsertRowid;

      // 2. Grava movimento no extrato de crédito do cliente (+ valor)
      const mov = db
        .prepare(
          `INSERT INTO cliente_credito_movimentos (
            clienteid, tipo, valor, ordemid, lancamentoid, criadopor
          ) VALUES (?, 'gerado', ?, ?, ?, ?)`
        )
        .run(clienteId, Math.abs(v), ordemId || null, lancamentoId, criadopor);

      const { saldo } = getExtratoCredito(clienteId);
      return {
        movimentoId: mov.lastInsertRowid,
        lancamentoId,
        saldoAtual: saldo,
      };
    })();
  }

  function devolverExcedente({ ordemId, clienteId, valor, pagamento, criadopor }) {
    const v = toNumber(valor, 0);
    if (v <= 0) throw new Error("Valor da devolução deve ser maior que zero.");
    if (!pagamento) throw new Error("Forma de pagamento da devolução é obrigatória.");

    return db.transaction(() => {
      // Cria lançamento na OS com valor negativo e a forma de pagamento em dinheiro/pix que foi devolvida
      const lancamento = db
        .prepare(
          `INSERT INTO lancamentos (
            data, tipo, categoria, descricao, pagamento, valor, pago, ordemid, clienteid, criadopor, origem
          ) VALUES (
            datetime('now','localtime'), 'Entrada', 'Estorno OS',
            'Devolução de valor pago por alteração/cancelamento de OS', ?, ?, 1, ?, ?, ?, 'estorno_os'
          )`
        )
        .run(pagamento, -Math.abs(v), ordemId || null, clienteId || null, criadopor);

      return { lancamentoId: lancamento.lastInsertRowid };
    })();
  }

  function usarCreditoOS({ ordemId, clienteId, valor, criadopor }) {
    const v = toNumber(valor, 0);
    if (v <= 0) throw new Error("Valor do crédito a utilizar deve ser maior que zero.");

    return db.transaction(() => {
      const { saldo } = getExtratoCredito(clienteId);
      const validacao = validarUsoCredito({ saldoDisponivel: saldo, valorDesejado: v });
      if (!validacao.valido) {
        throw new Error(validacao.erro);
      }

      // Cria lançamento de entrada na OS paga com CreditoLoja
      const lancamento = db
        .prepare(
          `INSERT INTO lancamentos (
            data, tipo, categoria, descricao, pagamento, valor, pago, ordemid, clienteid, criadopor, origem
          ) VALUES (
            datetime('now','localtime'), 'Entrada', 'Pagamento OS com crédito',
            'Pagamento de OS utilizando Crédito Loja', 'CreditoLoja', ?, 1, ?, ?, ?, 'credito_usado'
          )`
        )
        .run(Math.abs(v), ordemId, clienteId, criadopor);

      const lancamentoId = lancamento.lastInsertRowid;

      // Grava movimento de débito no extrato do cliente (- valor)
      const mov = db
        .prepare(
          `INSERT INTO cliente_credito_movimentos (
            clienteid, tipo, valor, ordemid, lancamentoid, criadopor
          ) VALUES (?, 'usado', ?, ?, ?, ?)`
        )
        .run(clienteId, -Math.abs(v), ordemId, lancamentoId, criadopor);

      const { saldo: saldoAtual } = getExtratoCredito(clienteId);
      return {
        movimentoId: mov.lastInsertRowid,
        lancamentoId,
        saldoAtual,
      };
    })();
  }

  function devolverCredito({ clienteId, valor, pagamento, criadopor }) {
    const v = toNumber(valor, 0);
    if (v <= 0) throw new Error("Valor a devolver deve ser maior que zero.");
    if (!pagamento) throw new Error("Forma de pagamento da devolução é obrigatória.");

    return db.transaction(() => {
      const { saldo } = getExtratoCredito(clienteId);
      if (centavos(v) > centavos(saldo)) {
        throw new Error(`Saldo de crédito insuficiente (disponível: R$ ${saldo.toFixed(2)}).`);
      }

      // 1. Cria saída de caixa real (pagamento em dinheiro, pix, etc)
      const lancamento = db
        .prepare(
          `INSERT INTO lancamentos (
            data, tipo, categoria, descricao, pagamento, valor, pago, clienteid, criadopor, origem
          ) VALUES (
            datetime('now','localtime'), 'Saída', 'Devolução de crédito',
            'Devolução de Crédito Loja ao cliente em dinheiro/espécie', ?, ?, 1, ?, ?, 'credito_devolvido'
          )`
        )
        .run(pagamento, Math.abs(v), clienteId, criadopor);

      const lancamentoId = lancamento.lastInsertRowid;

      // 2. Grava movimento de débito no extrato (- valor)
      const mov = db
        .prepare(
          `INSERT INTO cliente_credito_movimentos (
            clienteid, tipo, valor, lancamentoid, criadopor
          ) VALUES (?, 'devolvido', ?, ?, ?)`
        )
        .run(clienteId, -Math.abs(v), lancamentoId, criadopor);

      const { saldo: saldoAtual } = getExtratoCredito(clienteId);
      return {
        movimentoId: mov.lastInsertRowid,
        lancamentoId,
        saldoAtual,
      };
    })();
  }

  function lancarSaldoInicial({ clienteId, valor, motivo, criadopor }) {
    const v = toNumber(valor, 0);
    if (v <= 0) throw new Error("Valor do saldo inicial deve ser maior que zero.");

    return db.transaction(() => {
      // Saldo inicial entra no extrato SEM lançamento contábil (para não distorcer DRE do mês)
      const mov = db
        .prepare(
          `INSERT INTO cliente_credito_movimentos (
            clienteid, tipo, valor, motivo, criadopor
          ) VALUES (?, 'saldo_inicial', ?, ?, ?)`
        )
        .run(clienteId, Math.abs(v), motivo || "Saldo inicial", criadopor);

      const { saldo: saldoAtual } = getExtratoCredito(clienteId);
      return {
        movimentoId: mov.lastInsertRowid,
        saldoAtual,
      };
    })();
  }

  function lancarAjusteManual({ clienteId, tipo, valor, motivo, criadopor }) {
    const v = toNumber(valor, 0);
    if (v <= 0) throw new Error("Valor do ajuste deve ser maior que zero.");
    if (!motivo) throw new Error("Motivo do ajuste é obrigatório.");

    return db.transaction(() => {
      const { saldo } = getExtratoCredito(clienteId);

      if (tipo === "entrada") {
        // Cortesia/bônus: lançamento contábil CreditoLoja negativo para compensar a receita no uso
        const lancamento = db
          .prepare(
            `INSERT INTO lancamentos (
              data, tipo, categoria, descricao, pagamento, valor, pago, clienteid, criadopor, origem
            ) VALUES (
              datetime('now','localtime'), 'Entrada', 'Ajuste de crédito',
              ?, 'CreditoLoja', ?, 1, ?, ?, 'credito_ajuste'
            )`
          )
          .run(`Ajuste de crédito: ${motivo}`, -Math.abs(v), clienteId, criadopor);

        const lancamentoId = lancamento.lastInsertRowid;

        const mov = db
          .prepare(
            `INSERT INTO cliente_credito_movimentos (
              clienteid, tipo, valor, lancamentoid, motivo, criadopor
            ) VALUES (?, 'ajuste_entrada', ?, ?, ?, ?)`
          )
          .run(clienteId, Math.abs(v), lancamentoId, motivo, criadopor);

        const { saldo: saldoAtual } = getExtratoCredito(clienteId);
        return { movimentoId: mov.lastInsertRowid, lancamentoId, saldoAtual };
      } else if (tipo === "saida") {
        if (centavos(v) > centavos(saldo)) {
          throw new Error(`Saldo insuficiente para baixar crédito (disponível: R$ ${saldo.toFixed(2)}).`);
        }

        const lancamento = db
          .prepare(
            `INSERT INTO lancamentos (
              data, tipo, categoria, descricao, pagamento, valor, pago, clienteid, criadopor, origem
            ) VALUES (
              datetime('now','localtime'), 'Entrada', 'Ajuste de crédito',
              ?, 'CreditoLoja', ?, 1, ?, ?, 'credito_ajuste'
            )`
          )
          .run(`Baixa de crédito: ${motivo}`, Math.abs(v), clienteId, criadopor);

        const lancamentoId = lancamento.lastInsertRowid;

        const mov = db
          .prepare(
            `INSERT INTO cliente_credito_movimentos (
              clienteid, tipo, valor, lancamentoid, motivo, criadopor
            ) VALUES (?, 'ajuste_saida', ?, ?, ?, ?)`
          )
          .run(clienteId, -Math.abs(v), lancamentoId, motivo, criadopor);

        const { saldo: saldoAtual } = getExtratoCredito(clienteId);
        return { movimentoId: mov.lastInsertRowid, lancamentoId, saldoAtual };
      } else {
        throw new Error("Tipo de ajuste inválido (use 'entrada' ou 'saida').");
      }
    })();
  }

  function estornarMovimento({ movimentoId, usuarioId }) {
    return db.transaction(() => {
      const mov = db.prepare("SELECT * FROM cliente_credito_movimentos WHERE id=?").get(movimentoId);
      if (!mov) throw new Error("Movimento de crédito não encontrado.");

      if (mov.tipo === "estorno" || mov.estorna_id) {
        throw new Error("Este movimento já é um estorno.");
      }

      const jaEstornado = db
        .prepare("SELECT id FROM cliente_credito_movimentos WHERE estorna_id=?")
        .get(movimentoId);
      if (jaEstornado) {
        throw new Error("Este movimento já foi estornado anteriormente.");
      }

      const { saldo } = getExtratoCredito(mov.clienteid);

      // Se o movimento adicionou crédito (valor > 0), estorná-lo irá subtrair crédito
      if (mov.valor > 0 && centavos(saldo) < centavos(mov.valor)) {
        throw new Error(
          `Estorno cancelado: deixaria o saldo do cliente negativo (saldo atual: R$ ${saldo.toFixed(2)}, estorno: R$ ${mov.valor.toFixed(2)}).`
        );
      }

      // Soft-delete do lançamento financeiro associado, se houver
      if (mov.lancamentoid) {
        db.prepare(
          `UPDATE lancamentos
           SET deletedat = datetime('now','localtime'), deletedpor = ?
           WHERE id = ?`
        ).run(usuarioId, mov.lancamentoid);
      }

      // Cria movimento de estorno com valor oposto
      const estorno = db
        .prepare(
          `INSERT INTO cliente_credito_movimentos (
            clienteid, tipo, valor, ordemid, estorna_id, motivo, criadopor
          ) VALUES (?, 'estorno', ?, ?, ?, ?, ?)`
        )
        .run(
          mov.clienteid,
          -mov.valor,
          mov.ordemid || null,
          mov.id,
          `Estorno do movimento #${mov.id} (${mov.tipo})`,
          usuarioId
        );

      const { saldo: saldoAtual } = getExtratoCredito(mov.clienteid);
      return {
        estornoId: estorno.lastInsertRowid,
        saldoAtual,
      };
    })();
  }

  return {
    getExtratoCredito,
    gerarCreditoPorExcedente,
    devolverExcedente,
    usarCreditoOS,
    devolverCredito,
    lancarSaldoInicial,
    lancarAjusteManual,
    estornarMovimento,
  };
}

module.exports = { createClienteCreditoService };
