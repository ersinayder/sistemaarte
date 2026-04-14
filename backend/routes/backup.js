
const router = require("express").Router();
const { auth } = require("../middlewares/auth");
const { backup } = require("../database");

router.post("/", auth(["admin"]), async (_req, res) => {
  try { await backup(); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
