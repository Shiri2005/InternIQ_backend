const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    task: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Task",
},
    description: {
      type: String,
    },
    fileUrl: {
      type: String,
    },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "reviewed"],
    },
    score: {
      type: Number,
      default: null,
    },
    feedback: {
      type: String,
      default: "",  
    },
    isCertified: {
      type: Boolean,
      default: false,
    },
    certificateUrl: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Submission", submissionSchema);