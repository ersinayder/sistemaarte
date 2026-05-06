import { describe, it, expect } from 'vitest'
import {
  validarEntradaOS,
  validarStatus,
  normalizarStatus,
  validarPrazo,
  descricaoEntradaOS,
  descricaoRestanteOS,
} from '../domain/ordensRules.js'

// --- validarEntradaOS ---
describe('validarEntradaOS', () => {
  it('aceita total positivo sem entrada', () => expect(validarEntradaOS(500, 0)).toBeNull())
  it('aceita entrada igual ao total', () => expect(validarEntradaOS(500, 500)).toBeNull())
  it('aceita entrada parcial', () => expect(validarEntradaOS(500, 200)).toBeNull())
  it('rejeita total zero', () => expect(validarEntradaOS(0, 0)).toMatch(/maior que zero/))
  it('rejeita total negativo', () => expect(validarEntradaOS(-100, 0)).toMatch(/maior que zero/))
  it('rejeita entrada negativa', () => expect(validarEntradaOS(500, -1)).toMatch(/invalido/))
  it('rejeita entrada maior que total', () => expect(validarEntradaOS(500, 600)).toMatch(/maior que o valor total/))
})

// --- validarStatus ---
describe('validarStatus', () => {
  it('aceita status valido sem transicao', () => expect(validarStatus('Aguardando')).toBeNull())
  it('transicao valida: Aguardando -> Em Producao', () => expect(validarStatus('Em Produção', 'Aguardando')).toBeNull())
  it('transicao valida: Pronto -> Entregue', () => expect(validarStatus('Entregue', 'Pronto')).toBeNull())
  it('transicao invalida: Entregue -> Aguardando', () => expect(validarStatus('Aguardando', 'Entregue')).toMatch(/invalida/))
  it('transicao invalida: Cancelado -> Em Producao', () => expect(validarStatus('Em Produção', 'Cancelado')).toMatch(/invalida/))
  it('rejeita status desconhecido', () => expect(validarStatus('Finalizado')).toMatch(/invalido/))
})

// --- normalizarStatus ---
describe('normalizarStatus', () => {
  it('normaliza alias Cancelada -> Cancelado', () => expect(normalizarStatus('Cancelada')).toBe('Cancelado'))
  it('preserva valores ja corretos', () => expect(normalizarStatus('Aguardando')).toBe('Aguardando'))
})

// --- validarPrazo ---
describe('validarPrazo', () => {
  it('aceita formato YYYY-MM-DD', () => expect(validarPrazo('2026-12-31')).toBeNull())
  it('aceita prazo vazio (opcional)', () => expect(validarPrazo('')).toBeNull())
  it('rejeita formato DD/MM/YYYY', () => expect(validarPrazo('31/12/2026')).toMatch(/YYYY-MM-DD/))
})

// --- descricoes ---
describe('descricaoEntradaOS', () => {
  it('gera label Entrada para entrada parcial', () => {
    expect(descricaoEntradaOS('OS-001', 'João', 'Quadro', 500, 200)).toContain('Entrada')
  })
  it('gera label Total para entrada igual ao total', () => {
    expect(descricaoEntradaOS('OS-001', 'João', 'Quadro', 500, 500)).toContain('Total')
  })
  it('gera label Sem entrada quando entrada zero', () => {
    expect(descricaoEntradaOS('OS-001', 'João', 'Quadro', 500, 0)).toContain('Sem entrada')
  })
})

describe('descricaoRestanteOS', () => {
  it('inclui numero e cliente', () => {
    const d = descricaoRestanteOS('OS-001', 'Maria', 'Moldura')
    expect(d).toContain('Restante')
    expect(d).toContain('OS-001')
    expect(d).toContain('Maria')
  })
})
