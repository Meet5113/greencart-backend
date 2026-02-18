const Product = require("../models/Product");

const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, category, image, isActive } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ message: "name and price are required" });
    }

    const product = await Product.create({
      name,
      description,
      price,
      category,
      image,
      isActive,
    });

    if (typeof req.logAdminAction === "function") {
      void req.logAdminAction({
        action: "product.create",
        entityType: "product",
        entityId: product._id,
        metadata: {
          name: product.name,
          category: product.category,
          price: product.price,
        },
      });
    }

    return res.status(201).json(product);
  } catch (error) {
    return next(error);
  }
};

const getProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true }).sort({ createdAt: -1 });
    return res.status(200).json(products);
  } catch (error) {
    return next(error);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isActive: true });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.status(200).json(product);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ message: "Product not found" });
    }

    return next(error);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const {
      name,
      description,
      price,
      category,
      image,
      imageUrl,
      isActive,
      active,
    } = req.body;
    const nextImage = image !== undefined ? image : imageUrl;
    const nextIsActive = isActive !== undefined ? isActive : active;

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ message: "name cannot be empty" });
    }

    if (price !== undefined) {
      const parsedPrice = Number(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: "price must be a valid non-negative number" });
      }
    }

    if (nextIsActive !== undefined && typeof nextIsActive !== "boolean") {
      return res.status(400).json({ message: "active must be a boolean value" });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const previousIsActive = product.isActive !== false;
    const changedFields = [
      "name",
      "description",
      "price",
      "category",
      "image",
      "imageUrl",
      "isActive",
      "active",
    ].filter((field) => req.body[field] !== undefined);

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;
    if (price !== undefined) product.price = Number(price);
    if (category !== undefined) product.category = category;
    if (nextImage !== undefined) product.image = nextImage;
    if (nextIsActive !== undefined) product.isActive = nextIsActive;

    const updatedProduct = await product.save();

    if (typeof req.logAdminAction === "function") {
      const isSoftDelete = previousIsActive && updatedProduct.isActive === false;
      void req.logAdminAction({
        action: isSoftDelete ? "product.delete" : "product.update",
        entityType: "product",
        entityId: updatedProduct._id,
        metadata: {
          changedFields,
          isActive: updatedProduct.isActive,
        },
      });
    }

    return res.status(200).json(updatedProduct);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ message: "Product not found" });
    }

    return next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.isActive = false;
    const updatedProduct = await product.save();

    if (typeof req.logAdminAction === "function") {
      void req.logAdminAction({
        action: "product.delete",
        entityType: "product",
        entityId: updatedProduct._id,
        metadata: {
          isActive: updatedProduct.isActive,
        },
      });
    }

    return res.status(200).json(updatedProduct);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ message: "Product not found" });
    }

    return next(error);
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
