const router = require("express").Router();
const { getOne, getAll } = require("../database");
const { auth } = require("../middlewares/auth");
const { getResumoFinanceiroOS } = require("../domain/financeiroRules");
const { renderOrdemServicoHtml } = require("../utils/print/ordemServico");
const { sendPrintHtml } = require("../utils/print/base");
const { normalizePrintCopies, printHtml } = require("../utils/print/serverPrinter");
const { getImpressaoConfig } = require("../utils/impressaoConfig");

const SEL_ORDEM = `
  SELECT o.*,
    u.name AS criadopornome,
    COALESCE(
      (SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.valor>0 AND l.deletedat IS NULL),0
    ) AS valorrecebido,
    CASE
      WHEN (o.valortotal - COALESCE(
        (SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.valor>0 AND l.deletedat IS NULL),0
      )) < 0 THEN 0.0
      ELSE CAST(o.valortotal - COALESCE(
        (SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.valor>0 AND l.deletedat IS NULL),0
      ) AS REAL)
    END AS saldoaberto
  FROM ordens o
  LEFT JOIN users u ON u.id = o.criadopor
`;

router.get("/:id/pdf", auth(["admin", "caixa"]), (req, res) => {
  try {
    const os = getOne(SEL_ORDEM + " WHERE o.id=? AND o.deletedat IS NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    const itens = getAll(
      "SELECT * FROM ordem_itens WHERE ordemid=? ORDER BY id ASC",
      [req.params.id]
    );
    const logs = getAll(
      `SELECT sl.statusnovo, sl.createdat, sl.obs, u.name AS usuario
       FROM statuslog sl
       LEFT JOIN users u ON u.id = sl.usuarioid
       WHERE sl.ordemid = ? ORDER BY sl.createdat ASC`,
      [req.params.id]
    );
    const resumo = getResumoFinanceiroOS(req.params.id);
    const html = renderOrdemServicoHtml({
      ordem: os,
      itens,
      logs,
      resumo,
      autoPrint: req.query?.embedded !== "1",
    });

    sendPrintHtml(res, `ordem-${os.numero || os.id}.html`, html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/print", auth(["admin", "caixa"]), async (req, res) => {
  let copies;
  try {
    copies = normalizePrintCopies(req.body?.copies);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    const os = getOne(SEL_ORDEM + " WHERE o.id=? AND o.deletedat IS NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    const itens = getAll(
      "SELECT * FROM ordem_itens WHERE ordemid=? ORDER BY id ASC",
      [req.params.id]
    );
    const logs = getAll(
      `SELECT sl.statusnovo, sl.createdat, sl.obs, u.name AS usuario
       FROM statuslog sl
       LEFT JOIN users u ON u.id = sl.usuarioid
       WHERE sl.ordemid = ? ORDER BY sl.createdat ASC`,
      [req.params.id]
    );
    const resumo = getResumoFinanceiroOS(req.params.id);
    const printerConfig = getImpressaoConfig();
    if (!printerConfig.directPrintEnabled) {
      return res.json({
        ok: true,
        mode: "browser",
        message: `Abra a impressao da OS ${os.numero || os.id} no navegador.`,
        copies,
        printUrl: `/api/ordens/${os.id}/pdf?embedded=1`,
      });
    }
    const html = renderOrdemServicoHtml({ ordem: os, itens, logs, resumo });
    const result = await printHtml({
      html,
      jobName: `ordem-${os.numero || os.id}`,
      copies,
      printerConfig,
    });

    res.json({
      ok: true,
      mode: "server",
      message: `OS ${os.numero || os.id} enviada para impressao.`,
      copies: result.copies,
      printerName: result.printerName,
    });
  } catch (e) {
    res.status(500).json({
      error: "Nao foi possivel enviar a OS para a impressora do servidor.",
      detail: e.message,
    });
  }
});

module.exports = router;
