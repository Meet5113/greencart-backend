const express = require("express");
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");
const { protect: authenticate } = require("../middleware/authMiddleware");
const { adminOnly: authorizeAdmin } = require("../middleware/roleMiddleware");
const { attachAuditLogger } = require("../middleware/auditLogMiddleware");

const router = express.Router();

router.post("/", authenticate, authorizeAdmin, attachAuditLogger, createProduct);
router.get("/", getProducts);
router.get("/:id", getProductById);
router.put("/:id", authenticate, authorizeAdmin, attachAuditLogger, updateProduct);
router.delete("/:id", authenticate, authorizeAdmin, attachAuditLogger, deleteProduct);

module.exports = router;
