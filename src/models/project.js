const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    skills: [String],
    requiredSkills: {
      type: [String],
      default: [],
    },
    deadline: {
      type: Date,
      default: null,
    },
    assignedUsers: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    tier: {
      type: String,
      enum: ["free", "pro", "premium"],
      default: "free",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Project", projectSchema);