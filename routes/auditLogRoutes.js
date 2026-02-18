const express = require("express");
const { getAuditLogs } = require("../controllers/auditController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/", protect, adminOnly, getAuditLogs);

module.exports = router;
