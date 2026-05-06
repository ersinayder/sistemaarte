import { describe, it, expect } from 'vitest'
import { toNumber, validarNaoNegativo } from '../utils/numbers.js'

describe('toNumber', () => {
  it('converte string numerica', () => expect(toNumber('42.5')).toBe(42.5))
  it('retorna fallback para null', () => expect(toNumber(null)).toBe(0))
  it('retorna fallback para undefined', () => expect(toNumber(undefined)).toBe(0))
  it('retorna fallback para string vazia', () => expect(toNumber('')).toBe(0))
  it('retorna fallback para NaN', () => expect(toNumber('abc')).toBe(0))
  it('retorna fallback personalizado', () => expect(toNumber(null, 99)).toBe(99))
  it('preserva zero', () => expect(toNumber(0)).toBe(0))
  it('preserva negativo', () => expect(toNumber(-10)).toBe(-10))
})

describe('validarNaoNegativo', () => {
  it('aceita zero', () => expect(validarNaoNegativo(0, 'valor')).toBeNull())
  it('aceita positivo', () => expect(validarNaoNegativo(100, 'valor')).toBeNull())
  it('rejeita negativo', () => expect(validarNaoNegativo(-1, 'valor')).toMatch(/nao pode ser negativo/))
  it('rejeita string nao-numerica', () => expect(validarNaoNegativo('abc', 'valor')).toMatch(/numero valido/))
  it('aceita campo opcional vazio', () => expect(validarNaoNegativo(null, 'campo')).toBeNull())
})
