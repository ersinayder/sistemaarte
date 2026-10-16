import { describe, expect, it } from 'vitest'
import { calcQuadros } from './Orcamento'

describe('calcQuadros - cálculo de orçamento', () => {
  it('calcula o valor do fundo a R$ 100 por metro quadrado por padrão', () => {
    // 100cm x 100cm = 1.0 m²
    const res = calcQuadros({
      L: '100',
      A: '100',
      precoMoldura: 60,
      vidro: 'sem',
      impressao: false,
    })

    expect(res).not.toBeNull()
    expect(res.areaM2).toBe(1)
    expect(res.valorMetroFundo).toBe(100)
    expect(res.custoFundo).toBe(100) // 1 m² * R$ 100 = R$ 100
  })

  it('calcula proporcionalmente a área com taxa de R$ 100/m²', () => {
    // 50cm x 40cm = 0.5m x 0.4m = 0.2 m²
    const res = calcQuadros({
      L: '50',
      A: '40',
      precoMoldura: 60,
      vidro: 'sem',
      impressao: false,
    })

    expect(res).not.toBeNull()
    expect(res.areaM2).toBeCloseTo(0.2, 5)
    expect(res.custoFundo).toBeCloseTo(20, 2) // 0.2 m² * R$ 100 = R$ 20
  })

  it('permite sobrescrever precoFundo quando informado', () => {
    // 100cm x 50cm = 0.5 m² com precoFundo = 120
    const res = calcQuadros({
      L: '100',
      A: '50',
      precoMoldura: 60,
      vidro: 'sem',
      impressao: false,
      precoFundo: 120,
    })

    expect(res).not.toBeNull()
    expect(res.areaM2).toBe(0.5)
    expect(res.valorMetroFundo).toBe(120)
    expect(res.custoFundo).toBe(60) // 0.5 m² * R$ 120 = R$ 60
  })

  it('inclui o fundo de R$ 100/m² no custoTotal do quadro', () => {
    // 100cm x 100cm = 1.0 m²
    // Perímetro: (1 + 1) * 2 + 1.5 (peça >= 1m) = 5.5m * 60 = 330
    // Vidro 'minimo' (liso): 1 m² * 300 = 300
    // Fundo: 1 m² * 100 = 100
    // Impressão: false = 0
    // Total: 330 + 300 + 100 = 730
    const res = calcQuadros({
      L: '100',
      A: '100',
      precoMoldura: 60,
      vidro: 'minimo',
      impressao: false,
    })

    expect(res).not.toBeNull()
    expect(res.custoMoldura).toBe(330)
    expect(res.custoVidro).toBe(300)
    expect(res.custoFundo).toBe(100)
    expect(res.custoImpressao).toBe(0)
    expect(res.custoTotal).toBe(730)
  })
})
