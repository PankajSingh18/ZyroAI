import mongoose from "mongoose";
import User from "../models/user.model.js";

const createCreditError = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

export const deductCredits = async ({ userId, credits }) => {
  if (!mongoose.isObjectIdOrHexString(userId)) {
    throw createCreditError("A valid user ID is required", 400);
  }

  if (!Number.isInteger(credits) || credits <= 0) {
    throw createCreditError("Credits must be a positive integer", 400);
  }

  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      credits: { $gte: credits },
    },
    {
      $inc: { credits: -credits },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!user) {
    const existingUser = await User.exists({ _id: userId });
    if (!existingUser) {
      throw createCreditError("User not found", 404);
    }

    throw createCreditError("Insufficient Credits", 402);
  }

  return {
    success: true,
    creditsDeducted: credits,
    remainingCredits: user.credits,
  };
};