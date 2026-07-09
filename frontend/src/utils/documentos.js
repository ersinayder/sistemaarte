export const onlyDigits = value => String(value || '').replace(/\D/g, '')

export const normalizeCnpj = value =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14)

export const maskCPF = value => onlyDigits(value)
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  .slice(0, 14)

export const maskCNPJ = value => {
  const n = normalizeCnpj(value)
  if (n.length <= 2) return n
  if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`
  if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`
  if (n.length <= 12) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`
}

export const validaCPF = cpf => {
  const n = onlyDigits(cpf)
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += parseInt(n[i], 10) * (10 - i)
  let r = (s * 10) % 11
  if (r === 10 || r === 11) r = 0
  if (r !== parseInt(n[9], 10)) return false
  s = 0
  for (let i = 0; i < 10; i++) s += parseInt(n[i], 10) * (11 - i)
  r = (s * 10) % 11
  if (r === 10 || r === 11) r = 0
  return r === parseInt(n[10], 10)
}

function cnpjCharValue(char) {
  return char.charCodeAt(0) - 48
}

function calcularDigitoCnpj(base) {
  const weights = base.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const sum = base
    .split('')
    .reduce((total, char, index) => total + cnpjCharValue(char) * weights[index], 0)
  const mod = sum % 11
  return mod < 2 ? 0 : 11 - mod
}

export const validaCNPJ = cnpj => {
  const n = normalizeCnpj(cnpj)
  if (!/^[A-Z0-9]{12}\d{2}$/.test(n)) return false
  if (/^(\d)\1{13}$/.test(n)) return false
  return calcularDigitoCnpj(n.slice(0, 12)) === parseInt(n[12], 10)
    && calcularDigitoCnpj(n.slice(0, 13)) === parseInt(n[13], 10)
}

export function getDocumentoInputState(value, currentTipo = 'PF') {
  const normalized = normalizeCnpj(value)
  const hasLetters = /[A-Z]/.test(normalized)
  const tipo = normalized && (hasLetters || normalized.length > 11 || currentTipo === 'PJ') ? 'PJ' : 'PF'
  const cpf = tipo === 'PF' ? maskCPF(normalized) : ''
  const cnpj = tipo === 'PJ' ? maskCNPJ(normalized) : ''
  const cnpjError = tipo === 'PJ' && normalized.length === 14 && !validaCNPJ(normalized)
    ? 'CNPJ inválido'
    : ''

  return { tipo, cpf, cnpj, cpfError: '', cnpjError }
}
