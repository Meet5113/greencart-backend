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

module.exports = { createProduct, getProducts, getProductById };
