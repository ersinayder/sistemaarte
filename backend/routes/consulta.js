
const router = require("express").Router();
const https  = require("https");
const { auth } = require("../middlewares/auth");
const { normalizeCnpj, validaCNPJ } = require("../domain/cnpjRules");

function fetchJson(url, ms = 7000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }, rsp => {
      let b = "";
      rsp.on("data", d => b += d);
      rsp.on("end", () => { try { resolve(JSON.parse(b)); } catch { reject(new Error("JSON inválido")); } });
    });
    req.setTimeout(ms, () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
}

// GET /api/consulta/cnpj/:cnpj
router.get("/cnpj/:cnpj", auth(["admin","caixa"]), async (req, res) => {
  const cnpj = normalizeCnpj(req.params.cnpj);
  if (cnpj.length !== 14 || !validaCNPJ(cnpj)) return res.status(400).json({ error: "CNPJ inválido" });

  try {
    const d = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(cnpj)}`, 7000);
    if (d.razao_social) return res.json({
      fonte: "brasilapi",
      nome: d.razao_social, fantasia: d.nome_fantasia || d.razao_social,
      municipio: d.municipio, uf: d.uf,
      telefone: d.ddd_telefone_1, email: d.email,
      logradouro: d.logradouro, numero: d.numero,
      bairro: d.bairro, cep: d.cep,
    });
    throw new Error("sem dados");
  } catch {
    try {
      const d = await fetchJson(`https://receitaws.com.br/v1/cnpj/${encodeURIComponent(cnpj)}`, 6000);
      if (d.status === "ERROR") throw new Error(d.message || "não encontrado");
      return res.json({ ...d, fonte: "receitaws" });
    } catch {
      return res.status(500).json({ error: "Não foi possível consultar o CNPJ. Tente novamente." });
    }
  }
});

router.get("/cep/:cep", auth(["admin","caixa"]), async (req, res) => {
  const digits = String(req.params.cep || "").replace(/\D/g, "");
  if (digits.length !== 8) return res.status(400).json({ error: "CEP invalido" });

  try {
    const d = await fetchJson(`https://viacep.com.br/ws/${digits}/json/`, 7000);
    if (d?.erro) return res.status(404).json({ error: "CEP nao encontrado" });

    return res.json({
      cep: digits.replace(/(\d{5})(\d{3})/, "$1-$2"),
      logradouro: d.logradouro || "",
      bairro: d.bairro || "",
      cidade: d.localidade || "",
      municipio: d.localidade || "",
      uf: d.uf || "",
      codigomunicipio: d.ibge || "",
    });
  } catch {
    return res.status(504).json({ error: "Nao foi possivel consultar o CEP. Tente novamente." });
  }
});

// GET /api/consulta/cpf/:cpf - requer certificado digital (nao implementado)
router.get("/cpf/:cpf", auth(["admin","caixa"]), (_req, res) =>
  res.status(501).json({ error: "Consulta CPF requer certificado digital." })
);

module.exports = router;
