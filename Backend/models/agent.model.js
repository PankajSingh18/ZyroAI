import mongoose from "mongoose";

const agentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      unque: true,
    },
    knowledgeBase: {
      type: String,
    },
    instructions: {
      type: String,
    },
    tools: [
      {
        type: String,
        trim: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const Agent = mongoose.model("Agent", agentSchema);
export default Agent;
