const express = require("express");
const {
  addToCart,
  getMyCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require("../controllers/cartController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, addToCart);
router.get("/", protect, getMyCart);
router.put("/:productId", protect, updateCartItem);
router.delete("/:productId", protect, removeCartItem);
router.delete("/", protect, clearCart);

module.exports = router;
