const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");

console.log("pdfParse type:", typeof pdfParse);

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const Quiz = require("../models/Quiz");
const Attempt = require("../models/Attempt");
const User = require("../models/User");

const auth = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

const tierRank = {
  free: 0,
  pro: 1,
  premium: 2
};

function hasTierAccess(userTier, requiredTier) {
  return (tierRank[userTier] ?? -1) >= (tierRank[requiredTier] ?? Number.MAX_SAFE_INTEGER);
}

async function resolveAssignedUsers(assignedUsersInput, assignToAllInterns) {
  if (assignToAllInterns) {
    const users = await User.find({ role: "user" }).select("_id");
    return users.map((user) => user._id);
  }

  const assignedIds = Array.isArray(assignedUsersInput) ? assignedUsersInput : [];

  if (assignedIds.length === 0) {
    return [];
  }

  const users = await User.find({
    _id: { $in: assignedIds },
    role: "user"
  }).select("_id");

  return users.map((user) => user._id);
}

function parseMaybeJson(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  return rawQuestions
    .map((question) => ({
      question: String(question.question || "").trim(),
      options: Array.isArray(question.options)
        ? question.options.map((option) => String(option).trim()).filter(Boolean)
        : [],
      correctAnswer: Number(question.correctAnswer)
    }))
    .filter(
      (question) =>
        question.question &&
        question.options.length >= 2 &&
        Number.isInteger(question.correctAnswer) &&
        question.correctAnswer >= 0 &&
        question.correctAnswer < question.options.length
    );
}

function parsePdfQuestions(text) {
  const blocks = String(text || "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const questions = [];

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 3) {
      continue;
    }

    const questionLine = lines[0].replace(/^\d+[).\-:]\s*/, "");
    const options = [];
    let answerIndex = -1;

    for (const line of lines.slice(1)) {
      const optionMatch = line.match(/^(?:[A-Da-d]|\d+)\s*[).:-]\s*(.+)$/);
      if (optionMatch) {
        options.push(optionMatch[1].trim());
        continue;
      }

      const answerMatch = line.match(/^answer\s*[:=]\s*([A-Da-d]|\d+)$/i);
      if (answerMatch) {
        const token = answerMatch[1].trim();
        if (/^[A-Da-d]$/.test(token)) {
          answerIndex = token.toUpperCase().charCodeAt(0) - 65;
        } else {
          answerIndex = Number(token) - 1;
        }
      }
    }

    if (questionLine && options.length >= 2 && answerIndex >= 0 && answerIndex < options.length) {
      questions.push({
        question: questionLine,
        options,
        correctAnswer: answerIndex
      });
    }
  }

  return questions;
}

router.post("/", auth, admin, upload.single("quizPdf"), async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const sourceType = req.body.sourceType === "pdf" ? "pdf" : "manual";
    const requiredTier = ["free", "pro", "premium"].includes(req.body.requiredTier)
      ? req.body.requiredTier
      : "free";
    const assignToAllInterns = req.body.assignToAllInterns === "true" || req.body.assignToAllInterns === true;
    const notes = String(req.body.notes || "").trim();
    const manualQuestions = normalizeQuestions(parseMaybeJson(req.body.questions, []));
    const assignedUsers = await resolveAssignedUsers(
      parseMaybeJson(req.body.assignedUsers, []),
      assignToAllInterns
    );

    if (!assignToAllInterns && assignedUsers.length === 0) {
      return res.status(400).json({ message: "Assign at least one user" });
    }

    let questions = manualQuestions;
    let sourceFileName = "";

    if (sourceType === "pdf") {
      if (!req.file) {
        return res.status(400).json({ message: "PDF file is required" });
      }

      sourceFileName = req.file.originalname;
      const parsed = await pdfParse(req.file.buffer);
      // Log parsed PDF text for diagnosis
      console.log("PDF TEXT:", parsed.text);
      questions = parsePdfQuestions(parsed.text);
    }

    if (!title) {
      return res.status(400).json({ message: "Quiz title is required" });
    }

    if (questions.length === 0) {
      return res.status(400).json({
        message:
          sourceType === "pdf"
            ? "Unable to extract quiz questions from the PDF"
            : "At least one valid question is required"
      });
    }

    const quiz = new Quiz({
      title,
      questions,
      requiredTier,
      notes,
      assignToAllInterns,
      assignedUsers,
      sourceType,
      sourceFileName,
      createdBy: req.user._id
    });

    await quiz.save();
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", auth, async (req, res) => {
  let quizzes;

  if (req.user.role === "admin") {
    quizzes = await Quiz.find().populate("assignedUsers", "name email");
  } else {
    quizzes = await Quiz.find({
      $or: [
        { assignToAllInterns: true },
        { assignedUsers: req.user._id }
      ]
    }).select(
      "title assignedUsers createdBy sourceType sourceFileName createdAt requiredTier notes assignToAllInterns"
    );
    quizzes = quizzes.filter((quiz) => hasTierAccess(req.user.tier, quiz.requiredTier));
  }

  res.json(quizzes);
});

router.get("/user", auth, async (req, res) => {
  try {
    const quizzes = await Quiz.find({
      $or: [
        { assignToAllInterns: true },
        { assignedUsers: req.user._id }
      ]
    }).select(
      "title assignedUsers createdBy sourceType sourceFileName createdAt requiredTier notes assignToAllInterns"
    );

    const visibleQuizzes = quizzes.filter((quiz) => hasTierAccess(req.user.tier, quiz.requiredTier));
    res.json(visibleQuizzes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/attempts/me", auth, async (req, res) => {
  const attempts = await Attempt.find({ user: req.user._id }).populate("quiz");
  res.json(attempts);
});

router.get("/attempts", auth, admin, async (req, res) => {
  try {
    const attempts = await Attempt.find()
      .populate("quiz", "title")
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(attempts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/:id", auth, admin, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    await Attempt.deleteMany({ quiz: quiz._id });
    await quiz.deleteOne();

    res.json({ message: "Quiz deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:id", auth, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id).select("-questions.correctAnswer");

  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found" });
  }

  if (req.user.role !== "admin") {
    const isAssigned = quiz.assignToAllInterns || quiz.assignedUsers.some(
      (id) => id.toString() === req.user._id.toString()
    );

    if (!isAssigned) {
      return res.status(403).json({ message: "Not assigned this quiz" });
    }

    if (!hasTierAccess(req.user.tier, quiz.requiredTier)) {
      return res.status(403).json({ message: "Upgrade your tier to access this quiz" });
    }
  }

  res.json(quiz);
});

router.post("/:id/submit", auth, async (req, res) => {
  if (req.user.role === "admin") {
    return res.status(403).json({ message: "Admins cannot attempt quiz" });
  }

  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const isAssigned = quiz.assignToAllInterns || quiz.assignedUsers.some(
      (id) => id.toString() === req.user._id.toString()
    );

    if (!isAssigned) {
      return res.status(403).json({ message: "Not assigned this quiz" });
    }

    if (!hasTierAccess(req.user.tier, quiz.requiredTier)) {
      return res.status(403).json({ message: "Upgrade your tier to attempt this quiz" });
    }

    const existingAttempt = await Attempt.findOne({
      user: req.user._id,
      quiz: quiz._id
    });

    if (existingAttempt) {
      return res.status(400).json({ message: "Already attempted" });
    }

    let score = 0;
    const answers = req.body.answers;

    if (!answers || answers.length !== quiz.questions.length) {
      return res.status(400).json({ message: "Invalid answers" });
    }

    quiz.questions.forEach((q, index) => {
      if (answers[index] === q.correctAnswer) {
        score++;
      }
    });

    const attempt = new Attempt({
      user: req.user._id,
      quiz: quiz._id,
      score,
      total: quiz.questions.length,
      answers
    });

    await attempt.save();

    res.json({
      score,
      total: quiz.questions.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;