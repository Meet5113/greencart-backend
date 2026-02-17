const Order = require("../models/Order");
const Product = require("../models/Product");
const Subscription = require("../models/Subscription");

const addFrequencyToDate = (date, frequency) => {
  const next = new Date(date);

  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
  }

  return next;
};

const calculateNextFutureDeliveryDate = (currentNextDeliveryDate, frequency, now) => {
  let next = new Date(currentNextDeliveryDate);

  while (next <= now) {
    next = addFrequencyToDate(next, frequency);
  }

  return next;
};

const processDueSubscriptions = async () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const dueSubscriptions = await Subscription.find({
    status: "active",
    nextDeliveryDate: { $lte: now },
  });

  const processed = [];
  const skipped = [];
  const failed = [];

  for (const subscription of dueSubscriptions) {
    try {
      const product = await Product.findById(subscription.product);

      if (!product) {
        failed.push({ subscriptionId: subscription._id, reason: "Product not found" });
        continue;
      }

      if (!product.isActive) {
        failed.push({ subscriptionId: subscription._id, reason: "Product is not active" });
        continue;
      }

      if (typeof product.stock !== "number") {
        failed.push({ subscriptionId: subscription._id, reason: "Product stock is not configured" });
        continue;
      }

      if (product.stock < subscription.quantity) {
        failed.push({ subscriptionId: subscription._id, reason: "Insufficient stock" });
        continue;
      }

      const existingTodayOrder = await Order.findOne({
        user: subscription.user,
        paymentMethod: "SUBSCRIPTION",
        createdAt: { $gte: startOfDay, $lt: endOfDay },
        orderItems: {
          $elemMatch: {
            product: subscription.product,
            quantity: subscription.quantity,
          },
        },
        "orderItems.1": { $exists: false },
      });

      if (existingTodayOrder) {
        subscription.nextDeliveryDate = calculateNextFutureDeliveryDate(
          subscription.nextDeliveryDate,
          subscription.frequency,
          now
        );
        await subscription.save();

        skipped.push({
          subscriptionId: subscription._id,
          reason: "Order already created today",
          orderId: existingTodayOrder._id,
        });
        continue;
      }

      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: subscription.product,
          isActive: true,
          stock: { $gte: subscription.quantity },
        },
        { $inc: { stock: -subscription.quantity } },
        { new: true }
      );

      if (!updatedProduct) {
        failed.push({ subscriptionId: subscription._id, reason: "Insufficient stock" });
        continue;
      }

      let order;
      try {
        order = await Order.create({
          user: subscription.user,
          orderItems: [{ product: subscription.product, quantity: subscription.quantity }],
          totalAmount: updatedProduct.price * subscription.quantity,
          paymentMethod: "SUBSCRIPTION",
          status: "pending",
        });
      } catch (error) {
        await Product.findByIdAndUpdate(subscription.product, {
          $inc: { stock: subscription.quantity },
        });
        throw error;
      }

      subscription.nextDeliveryDate = calculateNextFutureDeliveryDate(
        subscription.nextDeliveryDate,
        subscription.frequency,
        now
      );
      await subscription.save();

      processed.push({
        subscriptionId: subscription._id,
        orderId: order._id,
      });
    } catch (error) {
      failed.push({
        subscriptionId: subscription._id,
        reason: error.message,
      });
    }
  }

  return {
    success: true,
    summary: {
      totalDue: dueSubscriptions.length,
      processed: processed.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    processed,
    skipped,
    failed,
  };
};

module.exports = { processDueSubscriptions };
