const express = require("express");
const {
  getAnalytics,
  getAnalyticsOverview,
  getAnalyticsTrends,
  getAnalyticsTopProducts,
  getAnalyticsTopCustomers,
  getAnalyticsExport,
} = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/", protect, adminOnly, getAnalytics);
router.get("/overview", protect, adminOnly, getAnalyticsOverview);
router.get("/trends", protect, adminOnly, getAnalyticsTrends);
router.get("/top-products", protect, adminOnly, getAnalyticsTopProducts);
router.get("/top-customers", protect, adminOnly, getAnalyticsTopCustomers);
router.get("/export", protect, adminOnly, getAnalyticsExport);

module.exports = router;
