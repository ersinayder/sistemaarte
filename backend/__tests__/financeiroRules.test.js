import { describe, it, expect, beforeEach } from 'vitest'
import { criarBancoTeste } from './setup.js'

/**
 * Versao testavel de getResumoFinanceiroOS que recebe o db como parametro
 * em vez de importar o singleton de producao.
 */
function getResumoFinanceiroOS(db, ordemId) {
  const ordem = db.prepare(
    `SELECT id, numero, clientenome, servico, valortotal, valorentrada
       FROM ordens WHERE id=? AND deletedat IS NULL`
  ).get(ordemId)
  if (!ordem) return null

  const recebido = db.prepare(
    `SELECT COALESCE(SUM(valor),0) AS total
       FROM caixa WHERE ordemid=? AND pago=1 AND deletedat IS NULL`
  ).get(ordemId)

  const recebidoTotal = Number(recebido?.total ?? 0)
  const total = Number(ordem.valortotal ?? 0)
  const saldo = Math.max(0, Math.round((total - recebidoTotal) * 100) / 100)

  return { ordem, recebido: recebidoTotal, saldo }
}

let db

beforeEach(() => {
  db = criarBancoTeste()
  // OS de R$500
  db.prepare(`INSERT INTO ordens (id, numero, clientenome, servico, valortotal, valorentrada, status)
              VALUES (1, 'OS-001', 'Cliente Teste', 'Quadro', 500, 0, 'Aguardando')`).run()
})

describe('getResumoFinanceiroOS', () => {
  it('retorna saldo cheio quando nenhum lancamento existe', () => {
    const r = getResumoFinanceiroOS(db, 1)
    expect(r.saldo).toBe(500)
    expect(r.recebido).toBe(0)
  })

  it('BUG-FIX: lancamento pago=0 NAO deve abater saldo', () => {
    // Simula o bug: lancamento gravado com pago=0
    db.prepare(`INSERT INTO caixa (ordemid, valor, tipo, descricao, pago, data)
                VALUES (1, 300, 'entrada', 'Restante OS-001', 0, '2026-05-06')`).run()
    const r = getResumoFinanceiroOS(db, 1)
    // saldo deve continuar 500 - lancamento pago=0 e ignorado
    expect(r.saldo).toBe(500)
    expect(r.recebido).toBe(0)
  })

  it('lancamento pago=1 abate saldo corretamente', () => {
    db.prepare(`INSERT INTO caixa (ordemid, valor, tipo, descricao, pago, data)
                VALUES (1, 300, 'entrada', 'Restante OS-001', 1, '2026-05-06')`).run()
    const r = getResumoFinanceiroOS(db, 1)
    expect(r.saldo).toBe(200)
    expect(r.recebido).toBe(300)
  })

  it('multiplos lancamentos pago=1 acumulam corretamente', () => {
    db.prepare(`INSERT INTO caixa (ordemid, valor, tipo, descricao, pago, data)
                VALUES (1, 200, 'entrada', 'Parcela 1', 1, '2026-05-06')`).run()
    db.prepare(`INSERT INTO caixa (ordemid, valor, tipo, descricao, pago, data)
                VALUES (1, 300, 'entrada', 'Parcela 2', 1, '2026-05-06')`).run()
    const r = getResumoFinanceiroOS(db, 1)
    expect(r.saldo).toBe(0)
    expect(r.recebido).toBe(500)
  })

  it('lancamento deletado e ignorado no saldo', () => {
    db.prepare(`INSERT INTO caixa (ordemid, valor, tipo, descricao, pago, data, deletedat)
                VALUES (1, 300, 'entrada', 'Restante OS-001', 1, '2026-05-06', datetime('now'))`).run()
    const r = getResumoFinanceiroOS(db, 1)
    expect(r.saldo).toBe(500)
  })

  it('saldo nao vai abaixo de zero com pagamento excedente', () => {
    db.prepare(`INSERT INTO caixa (ordemid, valor, tipo, descricao, pago, data)
                VALUES (1, 600, 'entrada', 'Excedente', 1, '2026-05-06')`).run()
    const r = getResumoFinanceiroOS(db, 1)
    expect(r.saldo).toBe(0)
  })

  it('retorna null para OS inexistente', () => {
    expect(getResumoFinanceiroOS(db, 999)).toBeNull()
  })

  it('imprecisao de ponto flutuante: 100 - 33.33 - 33.33 - 33.34 = 0', () => {
    db.prepare(`INSERT INTO ordens (id, numero, clientenome, valortotal, valorentrada, status)
                VALUES (2, 'OS-002', 'Cliente 2', 100, 0, 'Aguardando')`).run()
    db.prepare(`INSERT INTO caixa (ordemid, valor, tipo, descricao, pago, data)
                VALUES (2, 33.33, 'entrada', 'P1', 1, '2026-05-06')`).run()
    db.prepare(`INSERT INTO caixa (ordemid, valor, tipo, descricao, pago, data)
                VALUES (2, 33.33, 'entrada', 'P2', 1, '2026-05-06')`).run()
    db.prepare(`INSERT INTO caixa (ordemid, valor, tipo, descricao, pago, data)
                VALUES (2, 33.34, 'entrada', 'P3', 1, '2026-05-06')`).run()
    const r = getResumoFinanceiroOS(db, 2)
    expect(r.saldo).toBe(0)
  })
})
