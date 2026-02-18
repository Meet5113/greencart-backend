const express = require("express");
const { getAnalyticsExport } = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/export", protect, adminOnly, (req, res, next) => {
  if (!req.query.type) {
    req.query.type = "revenue";
  }
  return getAnalyticsExport(req, res, next);
});

module.exports = router;
