const Cart = require("../models/Cart");
const Product = require("../models/Product");

const getProductById = async (productId) => {
  return Product.findById(productId).select("name price isActive stock");
};

const recalculateTotalAmount = async (cart) => {
  if (!cart.cartItems.length) {
    cart.totalAmount = 0;
    return;
  }

  const productIds = cart.cartItems.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds } }).select("price");
  const priceMap = new Map(products.map((product) => [product._id.toString(), product.price]));

  cart.totalAmount = cart.cartItems.reduce((sum, item) => {
    const price = priceMap.get(item.product.toString()) || 0;
    return sum + price * item.quantity;
  }, 0);
};

const addToCart = async (req, res, next) => {
  try {
    const productId = req.body.productId || req.body.product;
    const quantity = Number(req.body.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: "productId and valid quantity are required" });
    }

    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (!product.isActive) {
      return res.status(400).json({ message: "Product is not active" });
    }

    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      cart = new Cart({ user: req.user.id, cartItems: [] });
    }

    const itemIndex = cart.cartItems.findIndex(
      (item) => item.product.toString() === productId.toString()
    );

    if (itemIndex >= 0) {
      const newQuantity = cart.cartItems[itemIndex].quantity + quantity;
      if (typeof product.stock === "number" && newQuantity > product.stock) {
        return res.status(400).json({ message: "Insufficient stock" });
      }
      cart.cartItems[itemIndex].quantity = newQuantity;
    } else {
      if (typeof product.stock === "number" && quantity > product.stock) {
        return res.status(400).json({ message: "Insufficient stock" });
      }
      cart.cartItems.push({ product: product._id, quantity });
    }

    await recalculateTotalAmount(cart);
    await cart.save();

    const populatedCart = await Cart.findById(cart._id).populate("cartItems.product");
    return res.status(200).json(populatedCart);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid product id" });
    }
    return next(error);
  }
};

const getMyCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id }).populate("cartItems.product");

    if (!cart) {
      cart = await Cart.create({ user: req.user.id, cartItems: [], totalAmount: 0 });
      cart = await Cart.findById(cart._id).populate("cartItems.product");
    }

    return res.status(200).json(cart);
  } catch (error) {
    return next(error);
  }
};

const updateCartItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const quantity = Number(req.body.quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: "Valid quantity is required" });
    }

    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (!product.isActive) {
      return res.status(400).json({ message: "Product is not active" });
    }

    if (typeof product.stock === "number" && quantity > product.stock) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemIndex = cart.cartItems.findIndex(
      (item) => item.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    cart.cartItems[itemIndex].quantity = quantity;
    await recalculateTotalAmount(cart);
    await cart.save();

    const populatedCart = await Cart.findById(cart._id).populate("cartItems.product");
    return res.status(200).json(populatedCart);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid product id" });
    }
    return next(error);
  }
};

const removeCartItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const originalLength = cart.cartItems.length;
    cart.cartItems = cart.cartItems.filter(
      (item) => item.product.toString() !== productId.toString()
    );

    if (cart.cartItems.length === originalLength) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    await recalculateTotalAmount(cart);
    await cart.save();

    const populatedCart = await Cart.findById(cart._id).populate("cartItems.product");
    return res.status(200).json(populatedCart);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid product id" });
    }
    return next(error);
  }
};

const clearCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = await Cart.create({ user: req.user.id, cartItems: [], totalAmount: 0 });
    } else {
      cart.cartItems = [];
      cart.totalAmount = 0;
      await cart.save();
    }

    const populatedCart = await Cart.findById(cart._id).populate("cartItems.product");
    return res.status(200).json(populatedCart);
  } catch (error) {
    return next(error);
  }
};

module.exports = { addToCart, getMyCart, updateCartItem, removeCartItem, clearCart };
