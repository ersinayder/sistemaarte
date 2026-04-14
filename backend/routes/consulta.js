
const router = require("express").Router();
const https  = require("https");
const { auth } = require("../middlewares/auth");

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
router.get("/cnpj/:cnpj", auth(), async (req, res) => {
  const digits = req.params.cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return res.status(400).json({ error: "CNPJ inválido" });

  try {
    const d = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, 7000);
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
      const d = await fetchJson(`https://receitaws.com.br/v1/cnpj/${digits}`, 6000);
      if (d.status === "ERROR") throw new Error(d.message || "não encontrado");
      return res.json({ ...d, fonte: "receitaws" });
    } catch(e2) {
      return res.status(500).json({ error: `CNPJ não encontrado: ${e2.message}` });
    }
  }
});

// GET /api/consulta/cpf/:cpf  — requer certificado digital (não implementado)
router.get("/cpf/:cpf", auth(), (_req, res) =>
  res.status(501).json({ error: "Consulta CPF requer certificado digital." })
);

module.exports = router;
