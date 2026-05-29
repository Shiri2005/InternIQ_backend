const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    tier: {
      type: String,
      enum: ["free", "pro", "premium"],
      default: "free",
    },
    skills: [String],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
