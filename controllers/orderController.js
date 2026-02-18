const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");

const createOrder = async (req, res, next) => {
  try {
    const { orderItems, paymentMethod } = req.body;

    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ message: "orderItems are required" });
    }

    const currentUser = await User.findById(req.user.id).select("role");
    if (!currentUser) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (currentUser.role !== "customer") {
      return res.status(403).json({ message: "Only customers can create orders" });
    }

    const normalizedItems = [];
    const quantityByProductId = new Map();

    for (const item of orderItems) {
      const productId = item?.product;
      const quantity = Number(item?.quantity);

      if (!productId || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: "Each order item must include valid product and quantity" });
      }

      const key = productId.toString();
      quantityByProductId.set(key, (quantityByProductId.get(key) || 0) + quantity);
      normalizedItems.push({ product: productId, quantity });
    }

    const productIds = [...quantityByProductId.keys()];
    const products = await Product.find({ _id: { $in: productIds } });

    if (products.length !== productIds.length) {
      return res.status(404).json({ message: "One or more products not found" });
    }

    const productMap = new Map(products.map((product) => [product._id.toString(), product]));

    for (const [productId, quantity] of quantityByProductId.entries()) {
      const product = productMap.get(productId);

      if (!product.isActive) {
        return res.status(400).json({ message: `Product ${product.name} is not active` });
      }

      if (typeof product.stock !== "number") {
        return res.status(400).json({ message: `Product ${product.name} has no stock configured` });
      }

      if (product.stock < quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }
    }

    let calculatedTotalAmount = 0;
    for (const item of normalizedItems) {
      const product = productMap.get(item.product.toString());
      calculatedTotalAmount += product.price * item.quantity;
    }

    const order = await Order.create({
      user: req.user.id,
      orderItems: normalizedItems,
      totalAmount: calculatedTotalAmount,
      paymentMethod,
      status: "pending",
    });

    const adjustedStocks = [];
    for (const [productId, quantity] of quantityByProductId.entries()) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: productId, isActive: true, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true }
      );

      if (!updatedProduct) {
        for (const adjusted of adjustedStocks) {
          await Product.findByIdAndUpdate(adjusted.productId, {
            $inc: { stock: adjusted.quantity },
          });
        }

        await Order.findByIdAndDelete(order._id);
        return res.status(400).json({ message: "Insufficient stock for one or more products" });
      }

      adjustedStocks.push({ productId, quantity });
    }

    return res.status(201).json({
      success: true,
      order,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid product id in orderItems" });
    }

    return next(error);
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("orderItems.product")
      .sort({ createdAt: -1 });
    return res.status(200).json(orders);
  } catch (error) {
    return next(error);
  }
};

const getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({})
      .populate("user", "name email")
      .populate("orderItems.product")
      .sort({ createdAt: -1 });
    return res.status(200).json(orders);
  } catch (error) {
    return next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
    const statusTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== status && !statusTransitions[order.status].includes(status)) {
      return res.status(400).json({
        message: `Invalid status transition from ${order.status} to ${status}`,
      });
    }

    const previousStatus = order.status;
    order.status = status;
    const updatedOrder = await order.save();

    if (typeof req.logAdminAction === "function") {
      void req.logAdminAction({
        action: "order.status_change",
        entityType: "order",
        entityId: updatedOrder._id,
        metadata: {
          fromStatus: previousStatus,
          toStatus: updatedOrder.status,
        },
      });
    }

    return res.status(200).json(updatedOrder);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ message: "Order not found" });
    }

    return next(error);
  }
};

const checkoutOrder = async (req, res, next) => {
  try {
    const { paymentMethod } = req.body;
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart || !Array.isArray(cart.cartItems) || cart.cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const quantityByProductId = new Map();
    const normalizedItems = [];

    for (const item of cart.cartItems) {
      const productId = item?.product;
      const quantity = Number(item?.quantity);

      if (!productId || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: "Invalid cart items" });
      }

      const key = productId.toString();
      quantityByProductId.set(key, (quantityByProductId.get(key) || 0) + quantity);
      normalizedItems.push({ product: productId, quantity });
    }

    const productIds = [...quantityByProductId.keys()];
    const products = await Product.find({ _id: { $in: productIds } });

    if (products.length !== productIds.length) {
      return res.status(404).json({ message: "One or more products not found" });
    }

    const productMap = new Map(products.map((product) => [product._id.toString(), product]));

    for (const [productId, quantity] of quantityByProductId.entries()) {
      const product = productMap.get(productId);

      if (!product.isActive) {
        return res.status(400).json({ message: `Product ${product.name} is not active` });
      }

      if (typeof product.stock !== "number") {
        return res.status(400).json({ message: `Product ${product.name} has no stock configured` });
      }

      if (product.stock < quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }
    }

    let calculatedTotalAmount = 0;
    for (const item of normalizedItems) {
      const product = productMap.get(item.product.toString());
      calculatedTotalAmount += product.price * item.quantity;
    }

    const order = await Order.create({
      user: req.user.id,
      orderItems: normalizedItems,
      totalAmount: calculatedTotalAmount,
      paymentMethod,
      status: "pending",
    });

    const adjustedStocks = [];
    for (const [productId, quantity] of quantityByProductId.entries()) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: productId, isActive: true, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true }
      );

      if (!updatedProduct) {
        for (const adjusted of adjustedStocks) {
          await Product.findByIdAndUpdate(adjusted.productId, {
            $inc: { stock: adjusted.quantity },
          });
        }

        await Order.findByIdAndDelete(order._id);
        return res.status(400).json({ message: "Insufficient stock for one or more products" });
      }

      adjustedStocks.push({ productId, quantity });
    }

    cart.cartItems = [];
    cart.totalAmount = 0;
    await cart.save();

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid cart item product id" });
    }

    return next(error);
  }
};

module.exports = { createOrder, getMyOrders, getAllOrders, updateOrderStatus, checkoutOrder };
