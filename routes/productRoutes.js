const express = require("express");
const {
  createProduct,
  getProducts,
  getProductById,
} = require("../controllers/productController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");

const router = express.Router();

router.route("/").post(protect, adminOnly, createProduct).get(getProducts);
router.get("/:id", getProductById);

module.exports = router;
