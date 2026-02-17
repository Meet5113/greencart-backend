const express = require("express");
const {
  createSubscription,
  getMySubscriptions,
  getAllSubscriptions,
  updateSubscriptionStatus,
  processSubscriptions,
} = require("../controllers/subscriptionController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", protect, createSubscription);
router.post("/process", protect, adminOnly, processSubscriptions);
router.get("/my", protect, getMySubscriptions);
router.get("/", protect, adminOnly, getAllSubscriptions);
router.put("/:id/status", protect, updateSubscriptionStatus);

module.exports = router;
