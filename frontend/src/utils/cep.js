export const onlyCepDigits = value => String(value || '').replace(/\D/g, '').slice(0, 8)

export function maskCep(value) {
  const digits = onlyCepDigits(value)
  return digits.replace(/(\d{5})(\d{1,3})$/, '$1-$2')
}

export async function buscarEnderecoPorCep(value) {
  const cep = onlyCepDigits(value)
  if (cep.length !== 8) return null

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
  if (!response.ok) return null

  const data = await response.json()
  if (data?.erro) return null

  return {
    cep: maskCep(cep),
    logradouro: data.logradouro || '',
    bairro: data.bairro || '',
    cidade: data.localidade || '',
    uf: data.uf || '',
  }
}
