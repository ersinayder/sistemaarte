
const router = require("express").Router();
const path = require("path");
const { auth, authPermission } = require("../middlewares/auth");
const { backup } = require("../database");
const { readBackupStatus } = require("../utils/backupStatus");

const BACKUPS_DIR = path.join(__dirname, "..", "data", "backups");

router.get("/status", auth(), authPermission("backups.ver"), (_req, res) => {
  res.json(readBackupStatus(BACKUPS_DIR));
});

router.post("/", auth(), authPermission("backups.executar"), async (_req, res) => {
  try {
    const result = await backup();
    res.json(result);
  }
  catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
