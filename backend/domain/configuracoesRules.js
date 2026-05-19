const DIGITS = /\D/g;

const FIELD_KEYS = [
  'razaosocial',
  'nomefantasia',
  'cnpj',
  'inscricaoestadual',
  'crt',
  'telefone',
  'email',
  'logradouro',
  'numero',
  'bairro',
  'municipio',
  'codigomunicipio',
  'uf',
  'cep',
];

const REQUIRED_EMPRESA_FIELDS = [
  'razaosocial',
  'cnpj',
  'crt',
  'logradouro',
  'numero',
  'bairro',
  'municipio',
  'codigomunicipio',
  'uf',
  'cep',
];

function cleanText(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function onlyDigits(value, max = 32) {
  return cleanText(value).replace(DIGITS, '').slice(0, max);
}

function normalizarEmpresaConfig(input = {}) {
  return {
    razaosocial: cleanText(input.razaosocial, 200),
    nomefantasia: cleanText(input.nomefantasia, 200),
    cnpj: onlyDigits(input.cnpj, 14),
    inscricaoestadual: onlyDigits(input.inscricaoestadual, 20),
    crt: cleanText(input.crt, 1),
    telefone: onlyDigits(input.telefone, 20),
    email: cleanText(input.email, 180).toLowerCase(),
    logradouro: cleanText(input.logradouro, 200),
    numero: cleanText(input.numero, 20),
    bairro: cleanText(input.bairro, 120),
    municipio: cleanText(input.municipio, 120),
    codigomunicipio: onlyDigits(input.codigomunicipio, 7),
    uf: cleanText(input.uf, 10).toUpperCase(),
    cep: onlyDigits(input.cep, 8),
  };
}

function validarEmpresaConfig(config = {}) {
  const errors = {};

  if (!config.razaosocial) errors.razaosocial = 'Razao social e obrigatoria';
  if (!config.cnpj) errors.cnpj = 'CNPJ e obrigatorio';
  else if (config.cnpj.length !== 14) errors.cnpj = 'CNPJ deve ter 14 digitos';
  if (!['1', '2', '3'].includes(config.crt)) errors.crt = 'CRT deve ser 1, 2 ou 3';
  if (!config.logradouro) errors.logradouro = 'Logradouro e obrigatorio';
  if (!config.numero) errors.numero = 'Numero e obrigatorio';
  if (!config.bairro) errors.bairro = 'Bairro e obrigatorio';
  if (!config.municipio) errors.municipio = 'Municipio e obrigatorio';
  if (!config.codigomunicipio) errors.codigomunicipio = 'Codigo IBGE e obrigatorio';
  else if (config.codigomunicipio.length !== 7) errors.codigomunicipio = 'Codigo IBGE deve ter 7 digitos';
  if (!config.uf || config.uf.length !== 2) errors.uf = 'UF deve ter 2 letras';
  if (!config.cep) errors.cep = 'CEP e obrigatorio';
  else if (config.cep.length !== 8) errors.cep = 'CEP deve ter 8 digitos';
  if (config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) {
    errors.email = 'E-mail invalido';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function statusEmpresaConfig(config = {}) {
  const missing = REQUIRED_EMPRESA_FIELDS.filter((key) => !cleanText(config[key]));

  return {
    status: missing.length === 0 ? 'OK' : 'Pendente',
    missing,
  };
}

function pickEmpresaConfig(row = {}) {
  const out = {};

  for (const key of FIELD_KEYS) out[key] = row[key] ?? '';

  return out;
}

module.exports = {
  normalizarEmpresaConfig,
  validarEmpresaConfig,
  statusEmpresaConfig,
  pickEmpresaConfig,
};
