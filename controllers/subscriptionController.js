const Product = require("../models/Product");
const Subscription = require("../models/Subscription");
const { processDueSubscriptions } = require("../services/subscriptionProcessor");

const calculateNextDeliveryDate = (startDate, frequency) => {
  const nextDate = new Date(startDate);

  if (frequency === "daily") {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (frequency === "weekly") {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (frequency === "monthly") {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }

  return nextDate;
};

const createSubscription = async (req, res, next) => {
  try {
    const { product, quantity, frequency, startDate } = req.body;
    const allowedFrequencies = ["daily", "weekly", "monthly"];

    if (!product || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      return res.status(400).json({ message: "product and valid quantity are required" });
    }

    if (!frequency || !allowedFrequencies.includes(frequency)) {
      return res.status(400).json({ message: "Valid frequency is required" });
    }

    const parsedStartDate = new Date(startDate);
    if (!startDate || Number.isNaN(parsedStartDate.getTime())) {
      return res.status(400).json({ message: "Valid startDate is required" });
    }

    const existingProduct = await Product.findById(product);
    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (!existingProduct.isActive) {
      return res.status(400).json({ message: "Product is not active" });
    }

    const nextDeliveryDate = calculateNextDeliveryDate(parsedStartDate, frequency);

    const subscription = await Subscription.create({
      user: req.user.id,
      product,
      quantity: Number(quantity),
      frequency,
      startDate: parsedStartDate,
      nextDeliveryDate,
    });

    return res.status(201).json(subscription);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid product id" });
    }

    return next(error);
  }
};

const getMySubscriptions = async (req, res, next) => {
  try {
    const subscriptions = await Subscription.find({ user: req.user.id })
      .populate("product")
      .sort({ createdAt: -1 });

    return res.status(200).json(subscriptions);
  } catch (error) {
    return next(error);
  }
};

const getAllSubscriptions = async (req, res, next) => {
  try {
    const subscriptions = await Subscription.find({})
      .populate("user", "name email")
      .populate("product")
      .sort({ createdAt: -1 });

    return res.status(200).json(subscriptions);
  } catch (error) {
    return next(error);
  }
};

const updateSubscriptionStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["paused", "cancelled"];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Status must be paused or cancelled" });
    }

    const subscription = await Subscription.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    if (subscription.status === "cancelled") {
      return res.status(400).json({ message: "Cancelled subscription cannot be updated" });
    }

    subscription.status = status;
    const updatedSubscription = await subscription.save();

    return res.status(200).json(updatedSubscription);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ message: "Subscription not found" });
    }

    return next(error);
  }
};

const processSubscriptions = async (req, res, next) => {
  try {
    const result = await processDueSubscriptions();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createSubscription,
  getMySubscriptions,
  getAllSubscriptions,
  updateSubscriptionStatus,
  processSubscriptions,
};
