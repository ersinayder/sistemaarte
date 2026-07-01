import { describe, expect, it } from 'vitest'
import {
  getDocumentoInputState,
  maskCNPJ,
  normalizeCnpj,
  validaCNPJ,
} from './documentos'

describe('documentos fiscais', () => {
  it('valida CNPJ numerico existente', () => {
    expect(normalizeCnpj('07.500.718/0001-96')).toBe('07500718000196')
    expect(validaCNPJ('07.500.718/0001-96')).toBe(true)
  })

  it('valida CNPJ alfanumerico pelo calculo oficial do digito verificador', () => {
    expect(normalizeCnpj('12.ABC.345/01DE-35')).toBe('12ABC34501DE35')
    expect(maskCNPJ('12abc34501de35')).toBe('12.ABC.345/01DE-35')
    expect(validaCNPJ('12.ABC.345/01DE-35')).toBe(true)
  })

  it('nao marca como CPF invalido enquanto um CNPJ numerico ainda esta sendo digitado', () => {
    expect(getDocumentoInputState('075.007.180-00', 'PF')).toEqual({
      tipo: 'PF',
      cpf: '075.007.180-00',
      cnpj: '',
      cpfError: '',
      cnpjError: '',
    })
  })

  it('trata letras como CNPJ em digitacao e so valida quando completo', () => {
    expect(getDocumentoInputState('AB.CD1.234/0001-4', 'PF')).toEqual({
      tipo: 'PJ',
      cpf: '',
      cnpj: 'AB.CD1.234/0001-4',
      cpfError: '',
      cnpjError: '',
    })
  })
})
