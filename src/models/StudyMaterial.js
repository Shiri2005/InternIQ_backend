const mongoose = require("mongoose");

const studyMaterialSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    notes: String,
    requiredTier: {
      type: String,
      enum: ["free", "pro", "premium"],
      default: "free"
    },
    assignToAllInterns: {
      type: Boolean,
      default: false
    },
    assignedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudyMaterial", studyMaterialSchema);