const express = require("express");
const {
  getAnalytics,
  getAnalyticsOverview,
  getAnalyticsTrends,
  getAnalyticsTopProducts,
  getAnalyticsTopCustomers,
  getAnalyticsExport,
  getAuditLogs,
} = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/analytics", protect, adminOnly, getAnalytics);
router.get("/analytics/overview", protect, adminOnly, getAnalyticsOverview);
router.get("/analytics/trends", protect, adminOnly, getAnalyticsTrends);
router.get("/analytics/top-products", protect, adminOnly, getAnalyticsTopProducts);
router.get("/analytics/top-customers", protect, adminOnly, getAnalyticsTopCustomers);
router.get("/analytics/export", protect, adminOnly, getAnalyticsExport);
router.get("/audit-logs", protect, adminOnly, getAuditLogs);

module.exports = router;
