import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import mongoose from "mongoose";
import Payment from "../models/Payment.model.js";
import User from "../models/user.model.js";

const Plans = {
  pro: {
    name: "Pro",
    amount: 29900,
    credits: 500,
  },
  team: {
    name: "Team",
    amount: 79900,
    credits: 2000,
  },
};

const isValidPaymentSignature = (orderId, paymentId, signature, secret) => {
  if (typeof signature !== "string" || !/^[\da-f]{64}$/i.test(signature)) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const provided = Buffer.from(signature, "hex");
  return (
    provided.length === expected.length &&
    timingSafeEqual(provided, expected)
  );
};

export const createOrder = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "User ID is required" });
    }

    const { plan } = req.body || {};
    const selectedPlan =
      typeof plan === "string" && Object.hasOwn(Plans, plan)
        ? Plans[plan]
        : null;
    if (!selectedPlan) {
      return res.status(400).json({ message: "Plan not found" });
    }

    const { default: razorpay } = await import("../config/razorpay.js");
    const receipt = `payment-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const order = await razorpay.orders.create({
      amount: selectedPlan.amount,
      currency: "INR",
      receipt,
      notes: { userId: String(userId), plan },
    });

    await Payment.create({
      userId,
      plan,
      credits: selectedPlan.credits,
      amount: selectedPlan.amount,
      currency: "INR",
      razorpayOrderId: order.id,
      status: "created",
    });

    return res.status(200).json({
      message: "Order created successfully",
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      plan: {
        name: selectedPlan.name,
        credits: selectedPlan.credits,
      },
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    return res.status(500).json({
      message: `Create payment order failed: ${error.message}`,
    });
  }
};

export const verify = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "User ID is required" });
    }

    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = req.body || {};
    if (
      typeof orderId !== "string" ||
      !orderId.trim() ||
      orderId.length > 128 ||
      typeof paymentId !== "string" ||
      !paymentId.trim() ||
      paymentId.length > 128 ||
      typeof signature !== "string"
    ) {
      return res.status(400).json({
        message: "Razorpay order, payment, and signature are required",
      });
    }

    const payment = await Payment.findOne({
      userId,
      razorpayOrderId: orderId,
    });
    if (!payment) {
      return res.status(404).json({ message: "Payment order not found" });
    }

    const { default: razorpay } = await import("../config/razorpay.js");
    if (
      !isValidPaymentSignature(
        orderId,
        paymentId,
        signature,
        process.env.RAZORPAY_KEY_SECRET,
      )
    ) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    if (payment.status === "paid") {
      if (payment.razorpayPaymentId === paymentId) {
        return res.status(200).json({
          message: "Payment already verified",
          alreadyVerified: true,
        });
      }
      return res.status(409).json({ message: "Payment order is already settled" });
    }
    if (payment.status !== "created") {
      return res.status(409).json({ message: "Payment order is not payable" });
    }

    const gatewayPayment = await razorpay.payments.fetch(paymentId);
    if (
      gatewayPayment.order_id !== orderId ||
      gatewayPayment.status !== "captured" ||
      gatewayPayment.amount !== payment.amount ||
      gatewayPayment.currency !== payment.currency
    ) {
      return res.status(409).json({
        message: "Razorpay payment is not captured for this order",
      });
    }

    const session = await mongoose.startSession();
    let remainingCredits;
    try {
      await session.withTransaction(async () => {
        const paidPayment = await Payment.findOneAndUpdate(
          {
            _id: payment._id,
            userId,
            status: "created",
          },
          {
            $set: {
              status: "paid",
              razorpayPaymentId: paymentId,
            },
          },
          {
            new: true,
            session,
          },
        );
        if (!paidPayment) {
          const error = new Error("Payment order has already been processed");
          error.statusCode = 409;
          throw error;
        }

        const user = await User.findOneAndUpdate(
          { _id: userId },
          { $inc: { credits: paidPayment.credits } },
          { new: true, session },
        );
        if (!user) {
          const error = new Error("User not found");
          error.statusCode = 404;
          throw error;
        }
        remainingCredits = user.credits;
      });
    } finally {
      await session.endSession();
    }

    return res.status(200).json({
      message: "Payment verified successfully",
      plan: payment.plan,
      creditsAdded: payment.credits,
      remainingCredits,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      message: `Payment verification failed: ${error.message}`,
    });
  }
};