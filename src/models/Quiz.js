const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  question: String,
  options: [String],
  correctAnswer: Number // index (0,1,2,3)
});

const quizSchema = new mongoose.Schema({
  title: String,
  questions: [questionSchema],
  requiredTier: {
    type: String,
    enum: ["free", "pro", "premium"],
    default: "free"
  },
  notes: String,
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
  sourceType: {
    type: String,
    enum: ["manual", "pdf"],
    default: "manual"
  },
  sourceFileName: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
});

module.exports = mongoose.model("Quiz", quizSchema);