const express = require("express");
const {
  createOrder,
  checkoutOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const { attachAuditLogger } = require("../middleware/auditLogMiddleware");

const router = express.Router();

router.post("/", protect, createOrder);
router.post("/checkout", protect, checkoutOrder);
router.get("/my", protect, getMyOrders);
router.get("/", protect, adminOnly, getAllOrders);
router.put("/:id/status", protect, adminOnly, attachAuditLogger, updateOrderStatus);

module.exports = router;
