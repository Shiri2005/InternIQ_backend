const Attempt = require("../models/Attempt");
const Submission = require("../models/Submission");
const Task = require("../models/Task");
const Project = require("../models/Project");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");
const { predictSuccess, recommendProjects, analyzeResume } = require("../services/aiService");
const {
  skillsMatchFlexible,
  normalizeSkills,
  analyzeResumeFile,
  analyzeResumeLocally,
  extractResumeText,
  computeMatches,
} = require("../utils/resumeAnalysis");

const tierRank = {
  free: 0,
  pro: 1,
  premium: 2,
};

function toSkillSet(skills) {
  return new Set(
    normalizeSkills(skills).map((skill) => skill.toLowerCase())
  );
}

function hasProjectAccess(userTier, projectTier) {
  const userLevel = tierRank[userTier] ?? -1;
  const projectLevel = tierRank[projectTier] ?? Number.MAX_SAFE_INTEGER;
  return userLevel >= projectLevel;
}

// using `normalizeSkills` imported from ../utils/resumeAnalysis

function parseRequiredSkillsInput(rawValue) {
  if (Array.isArray(rawValue)) {
    return normalizeSkills(rawValue);
  }

  const rawString = String(rawValue || "").trim();
  if (!rawString) return [];

  try {
    const parsed = JSON.parse(rawString);
    if (Array.isArray(parsed)) {
      return normalizeSkills(parsed);
    }
  } catch {
    // Fallback to comma/newline parsing for plain string input.
  }

  const baseTokens = normalizeSkills(
    rawString
      .replace(/[•|]/g, ",")
      .replace(/\s*\/\s*/g, ",")
      .replace(/\s*;\s*/g, ",")
  )
    .map((token) =>
      token
        .replace(/^[a-zA-Z\s]{2,30}:\s*/g, "")
        .replace(/\([^)]*\)/g, "")
        .trim()
    )
    .filter(Boolean);

  const cleanTokens = baseTokens.filter((token) => {
    const wordCount = token.split(/\s+/).filter(Boolean).length;
    const hasLetters = /[a-zA-Z]/.test(token);
    const looksLikeMetadata = /@|\d{4}|https?:\/\//i.test(token);

    return hasLetters && !looksLikeMetadata && wordCount > 0 && wordCount <= 4;
  });

  return normalizeSkills(cleanTokens);
}

// extractSkillsFromText logic is handled by utils/resumeAnalysis

function canonicalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function localPredictSuccess(features) {
  const avgQuiz = Number(features.avg_quiz_score) || 0;
  const avgReview = Number(features.avg_review_score) || 0;
  const consistency = Math.min(Math.max(Number(features.consistency) || 0, 0), 1) * 100;
  const tasksCompleted = Math.min((Number(features.tasks_completed) || 0) * 4, 100);

  const weighted = avgQuiz * 0.4 + avgReview * 0.25 + consistency * 0.2 + tasksCompleted * 0.15;
  return Math.max(0, Math.min(100, Math.round(weighted)));
}

function localRecommendProjects({ userSkills, projects }) {
  const normalizedUserSkills = normalizeSkills(userSkills).map((skill) => skill.toLowerCase());

  return (projects || [])
    .map((project) => {
      const projectSkills = normalizeSkills(project.skills).map((skill) => skill.toLowerCase());
      if (projectSkills.length === 0) {
        return {
          projectId: project.id || project._id,
          project: project.title || "Untitled project",
          match: 0,
          match_percentage: 0,
          matched_skills: [],
        };
      }

      const matchedSkills = projectSkills.filter((skill) => normalizedUserSkills.includes(skill));
      const match = matchedSkills.length / projectSkills.length;

      return {
        projectId: project.id || project._id,
        project: project.title || "Untitled project",
        match: Number(match.toFixed(2)),
        match_percentage: Math.round(match * 100),
        matched_skills: matchedSkills,
      };
    })
    .sort((a, b) => b.match - a.match)
    .slice(0, 3);
}

async function safePredictSuccess(features) {
  try {
    return await predictSuccess(features);
  } catch {
    return localPredictSuccess(features);
  }
}

async function safeRecommendProjects(payload) {
  try {
    return await recommendProjects(payload);
  } catch {
    return localRecommendProjects(payload);
  }
}

// reuse helpers from utils/resumeAnalysis: analyzeResumeFile, analyzeResumeLocally, extractResumeText

async function buildInsightFeatures(userId) {
  const [attempts, submissions, tasks] = await Promise.all([
    Attempt.find({ user: userId }),
    Submission.find({ user: userId, status: "reviewed", score: { $ne: null } }),
    Task.find({ assignedTo: userId }),
  ]);

  const quizPercentages = attempts
    .map((attempt) => {
      if (attempt.total && attempt.total > 0) {
        return (attempt.score / attempt.total) * 100;
      }
      return Number(attempt.score) || 0;
    })
    .filter((value) => Number.isFinite(value));

  const avgQuizScore = quizPercentages.length
    ? quizPercentages.reduce((sum, value) => sum + value, 0) / quizPercentages.length
    : 0;

  const reviewScores = submissions
    .map((submission) => Number(submission.score) || 0)
    .filter((value) => Number.isFinite(value));

  const avgReviewScore = reviewScores.length
    ? reviewScores.reduce((sum, value) => sum + value, 0) / reviewScores.length
    : 0;

  const tasksCompleted = tasks.filter((task) => task.status === "completed").length;
  const consistency = tasks.length ? tasksCompleted / tasks.length : Math.min(1, attempts.length / 5);

  return {
    avg_quiz_score: Math.round(avgQuizScore),
    tasks_completed: tasksCompleted,
    avg_review_score: Math.round(avgReviewScore),
    consistency: Number(consistency.toFixed(2)),
    quiz_attempts: attempts.length,
    reviewed_submissions: submissions.length,
    assigned_tasks: tasks.length,
  };
}

exports.getDashboardInsights = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("skills tier role");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const features = await buildInsightFeatures(req.user._id);
    const successProbability = await safePredictSuccess(features);
    const projectList = await Project.find()
      .select("title description tier skills createdAt")
      .lean();

    const accessibleProjects = projectList.filter((project) =>
      req.user.role === "admin" ? true : hasProjectAccess(user.tier, project.tier)
    );

    const recommendationInputSkills = normalizeSkills(req.query.skills || req.body?.skills || user.skills);
    const recommendations = await safeRecommendProjects({
      userSkills: recommendationInputSkills,
      projects: accessibleProjects.map((project) => ({
        id: project._id,
        title: project.title,
        description: project.description,
        skills: project.skills || [],
      })),
    });

    res.json({
      features,
      successProbability,
      recommendations,
      userSkills: recommendationInputSkills,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.analyzeResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Resume PDF is required" });
    }

    const requiredSkills = parseRequiredSkillsInput(req.body.requiredSkills);
    if (requiredSkills.length === 0) {
      return res.status(400).json({
        message: "Enter at least one required skill",
      });
    }

    const user = await User.findById(req.user._id).select("skills tier role");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const projectSkills = await Project.find()
      .select("skills title description tier")
      .lean();

    const skillPool = Array.from(
      new Set(
        [
          ...projectSkills.flatMap((project) => normalizeSkills(project.skills)),
          ...requiredSkills,
        ]
      )
    );

    let analysis;

    try {
      analysis = await analyzeResume({
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        skillPool,
      });
    } catch (e) {
      console.debug("[AIController] external analyzeResume failed:", e?.message || e);
      analysis = await analyzeResumeLocally(req.file.buffer, skillPool, req.file.originalname);
    }

    if (!Array.isArray(analysis.skills_found) || analysis.skills_found.length === 0) {
      console.debug("[AIController] external returned no skills, falling back to local analyzer");
      analysis = await analyzeResumeLocally(req.file.buffer, skillPool, req.file.originalname);
    }

    const foundSkills = normalizeSkills(analysis.skills_found || []);
    const resumeText = String(analysis.summary || "");

    const { normalizedRequiredSkills, normalizedResumeSkills: normalizedResumeSkills2, matchedSkills, missingSkills, matchPercentage } =
      computeMatches(requiredSkills, foundSkills, resumeText);

    try {
      console.debug("[AIController] normalizedRequiredSkills:", normalizedRequiredSkills);
      console.debug("[AIController] normalizedResumeSkills:", normalizedResumeSkills2);
      console.debug("[AIController] matchedSkills:", matchedSkills);
      console.debug("[AIController] missingSkills:", missingSkills);
      console.debug("[AIController] matchPercentage:", matchPercentage);
    } catch (e) {}

    user.skills = foundSkills;
    await user.save();

    const features = await buildInsightFeatures(req.user._id);
    const successProbability = await safePredictSuccess(features);

    const accessibleProjects = projectSkills.filter((project) =>
      req.user.role === "admin" ? true : hasProjectAccess(user.tier, project.tier)
    );

    const recommendations = await safeRecommendProjects({
      userSkills: foundSkills,
      projects: accessibleProjects.map((project) => ({
        id: project._id,
        title: project.title,
        description: project.description,
        skills: project.skills || [],
      })),
    });

    res.json({
      ...analysis,
      skills_found: foundSkills,
      required_skills: requiredSkills,
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
      match_percentage: matchPercentage,
      successProbability,
      recommendations,
      features,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAdminAnalytics = async (req, res) => {
  try {
    const users = await User.find({ role: "user" })
      .select("name email skills")
      .lean();

    const projects = await Project.find()
      .select("skills createdAt")
      .lean();

    const projectSkillDemand = new Map();
    projects.forEach((project) => {
      normalizeSkills(project.skills).forEach((skill) => {
        const key = skill.toLowerCase();
        projectSkillDemand.set(key, (projectSkillDemand.get(key) || 0) + 1);
      });
    });

    const demandEntries = Array.from(projectSkillDemand.entries());

    const userAnalytics = await Promise.all(
      users.map(async (user) => {
        const features = await buildInsightFeatures(user._id);
        const successRate = await safePredictSuccess(features);
        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          successRate: Number(successRate) || 0,
          skills: normalizeSkills(user.skills),
        };
      })
    );

    const averageSuccessRate = userAnalytics.length
      ? userAnalytics.reduce((sum, user) => sum + user.successRate, 0) / userAnalytics.length
      : 0;

    const topPerformingUsers = [...userAnalytics]
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5)
      .map((user) => ({
        userId: user.userId,
        name: user.name,
        email: user.email,
        successRate: Number(user.successRate.toFixed(1)),
      }));

    const commonMissingSkills = demandEntries
      .map(([skill, demand]) => {
        const usersHavingSkill = userAnalytics.filter((user) =>
          toSkillSet(user.skills).has(skill)
        ).length;

        return {
          skill,
          missingUsers: Math.max(users.length - usersHavingSkill, 0),
          demand,
        };
      })
      .sort((a, b) => {
        if (b.missingUsers !== a.missingUsers) return b.missingUsers - a.missingUsers;
        return b.demand - a.demand;
      })
      .slice(0, 8);

    const skillDemandTrends = demandEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([skill, count]) => ({ skill, count }));

    res.json({
      averageSuccessRate: Number(averageSuccessRate.toFixed(1)),
      topPerformingUsers,
      commonMissingSkills,
      skillDemandTrends,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
