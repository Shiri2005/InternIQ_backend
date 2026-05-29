const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

const {
  createSubmission,
  reviewSubmission,
  getSubmissions,
  getSubmissionsByProject,
  getMySubmissions,
} = require("../controllers/submissionController");

// Student submit
router.post("/", protect, createSubmission);

// Admin review
router.put("/:id/review", protect, admin, reviewSubmission);

// Get all (Admin only ideally)
router.get("/", protect, admin, getSubmissions);

// Get submissions for a project
router.get("/project/:projectId", protect, getSubmissionsByProject);

// Get logged-in user submissions
router.get("/my", protect, getMySubmissions);

module.exports = router;