import api from '../services/api'

export const onlyCepDigits = value => String(value || '').replace(/\D/g, '').slice(0, 8)

export function maskCep(value) {
  const digits = onlyCepDigits(value)
  return digits.replace(/(\d{5})(\d{1,3})$/, '$1-$2')
}

export async function buscarEnderecoPorCep(value) {
  const cep = onlyCepDigits(value)
  if (cep.length !== 8) return null

  const { data } = await api.get(`/consulta/cep/${cep}`)

  return {
    cep: data.cep || maskCep(cep),
    logradouro: data.logradouro || '',
    bairro: data.bairro || '',
    cidade: data.cidade || data.municipio || '',
    municipio: data.municipio || data.cidade || '',
    uf: data.uf || '',
    codigomunicipio: data.codigomunicipio || '',
  }
}
