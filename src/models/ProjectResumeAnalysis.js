const mongoose = require("mongoose");

const projectResumeAnalysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    resumeMatchPercentage: {
      type: Number,
      default: 0,
    },
    matchedSkills: {
      type: [String],
      default: [],
    },
    missingSkills: {
      type: [String],
      default: [],
    },
    suggestions: {
      type: [String],
      default: [],
    },
    uploadedResumePath: {
      type: String,
      default: "",
    },
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

projectResumeAnalysisSchema.index({ userId: 1, projectId: 1 }, { unique: true });

module.exports = mongoose.model("ProjectResumeAnalysis", projectResumeAnalysisSchema);