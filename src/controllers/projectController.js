const Project = require("../models/Project");
const Task = require("../models/Task"); 
const ProjectResumeAnalysis = require("../models/ProjectResumeAnalysis");
const User = require("../models/User");
const {
  analyzeResumeFile,
  buildSuggestions,
  computeReadinessStatus,
  normalizeSkills,
  computeMatches,
} = require("../utils/resumeAnalysis");

const tierRank = {
  free: 0,
  pro: 1,
  premium: 2,
};

function hasProjectAccess(userTier, projectTier) {
  const userLevel = tierRank[userTier] ?? -1;
  const projectLevel = tierRank[projectTier] ?? Number.MAX_SAFE_INTEGER;
  return userLevel >= projectLevel;
}

function parseSkillsInput(value) {
  return normalizeSkills(value);
}

function parseUsersInput(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }

  return [...new Set(String(value || "").split(/[\n,]/).map((item) => String(item).trim()).filter(Boolean))];
}

function isFutureDate(value) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return date >= today;
}

function getProjectRequiredSkills(project) {
  const requiredSkills = parseSkillsInput(project?.requiredSkills);
  if (requiredSkills.length > 0) {
    return requiredSkills;
  }

  return parseSkillsInput(project?.skills);
}



// Admin create project
exports.createProject = async (req, res) => {
  try {
    const validTier = tierRank[req.body.tier] != null ? req.body.tier : "free";
    const requiredSkills = parseSkillsInput(req.body.requiredSkills || req.body.skills);
    const skills = parseSkillsInput(req.body.skills || req.body.requiredSkills);
    const assignedUsers = parseUsersInput(req.body.assignedUsers);
    const deadline = req.body.deadline ? new Date(req.body.deadline) : null;

    if (!String(req.body.title || "").trim() || !String(req.body.description || "").trim()) {
      return res.status(400).json({ message: "Project title and description are required" });
    }

    if (requiredSkills.length === 0) {
      return res.status(400).json({ message: "Please add at least one required skill" });
    }

    if (!isFutureDate(req.body.deadline)) {
      return res.status(400).json({ message: "Please choose today or a future deadline" });
    }

    if (assignedUsers.length === 0) {
      return res.status(400).json({ message: "Assign at least one user before saving the project" });
    }

    const project = await Project.create({
      title: req.body.title,
      description: req.body.description,
      skills: skills.length > 0 ? skills : requiredSkills,
      requiredSkills: requiredSkills.length > 0 ? requiredSkills : skills,
      deadline: deadline && !Number.isNaN(deadline.getTime()) ? deadline : null,
      assignedUsers,
      tier: validTier,
      createdBy: req.user._id,
    });

    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all projects (for admin)
exports.getProjects = async (req, res) => {
  try {
    const projects = req.user.role === "admin"
      ? await Project.find().populate("assignedUsers", "name email tier skills")
      : await Project.find()
          .populate("assignedUsers", "name email tier skills")
          .then((list) =>
            list.filter((project) => {
              const assignedByProject = project.assignedUsers?.some(
                (user) => user._id.toString() === req.user._id.toString()
              );

              return assignedByProject;
            })
          );
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    res.json(req.project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get only assigned projects (for user)
exports.getMyProjects = async (req, res) => {
  try {
    const [tasks, projectsByAssignment] = await Promise.all([
      Task.find({ assignedTo: req.user._id }).populate("project"),
      Project.find({ assignedUsers: req.user._id }).populate("assignedUsers", "name email tier skills"),
    ]);

    // remove duplicates (important)
    const uniqueProjects = [];
    const map = new Set();

    tasks.forEach((t) => {
      if (t.project && !map.has(t.project._id.toString())) {
        map.add(t.project._id.toString());
        uniqueProjects.push(t.project);
      }
    });

    projectsByAssignment.forEach((project) => {
      if (project && !map.has(project._id.toString())) {
        map.add(project._id.toString());
        uniqueProjects.push(project);
      }
    });

    res.json(uniqueProjects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const requiredSkills = parseSkillsInput(req.body.requiredSkills || req.body.skills || project.requiredSkills);
    const skills = parseSkillsInput(req.body.skills || req.body.requiredSkills || project.skills);
    const assignedUsers = req.body.assignedUsers != null ? parseUsersInput(req.body.assignedUsers) : project.assignedUsers;
    const deadline = req.body.deadline ? new Date(req.body.deadline) : project.deadline;

    if (req.body.deadline && !isFutureDate(req.body.deadline)) {
      return res.status(400).json({ message: "Please choose today or a future deadline" });
    }

    if (req.body.assignedUsers != null && assignedUsers.length === 0) {
      return res.status(400).json({ message: "Assign at least one user before saving the project" });
    }

    if ((req.body.requiredSkills || req.body.skills) && requiredSkills.length === 0) {
      return res.status(400).json({ message: "Please add at least one required skill" });
    }

    project.title = req.body.title ?? project.title;
    project.description = req.body.description ?? project.description;
    project.skills = skills.length > 0 ? skills : requiredSkills;
    project.requiredSkills = requiredSkills.length > 0 ? requiredSkills : skills;
    project.deadline = deadline && !Number.isNaN(new Date(deadline).getTime()) ? deadline : null;
    project.assignedUsers = assignedUsers;
    project.tier = tierRank[req.body.tier] != null ? req.body.tier : project.tier;

    const updatedProject = await project.save();
    res.json(updatedProject);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProjectReadiness = async (req, res) => {
  try {
    const project = await Project.findById(req.project._id).populate("assignedUsers", "name email skills tier");
    const requiredSkills = getProjectRequiredSkills(project);

    if (req.user.role === "admin") {
      const tasks = await Task.find({ project: project._id }).populate("assignedTo", "name email skills");
      // fetch analyses sorted by newest first so we pick latest per user
      const analyses = await ProjectResumeAnalysis.find({ projectId: project._id }).sort({ analyzedAt: -1 }).lean();
      const analysisMap = new Map();
      for (const analysis of analyses) {
        const key = analysis.userId.toString();
        if (!analysisMap.has(key)) {
          analysisMap.set(key, analysis);
        }
      }
      const taskUsers = tasks
        .map((task) => task.assignedTo)
        .filter(Boolean)
        .map((user) => ({
          userId: user._id.toString(),
          name: user.name,
          email: user.email,
        }));
      const projectUsers = Array.isArray(project.assignedUsers)
        ? project.assignedUsers.map((user) => ({
            userId: user._id.toString(),
            name: user.name,
            email: user.email,
          }))
        : [];

      const combinedUsers = [...projectUsers, ...taskUsers];
      const dedupedUsers = [];
      const seenUsers = new Set();

      combinedUsers.forEach((user) => {
        if (!seenUsers.has(user.userId)) {
          seenUsers.add(user.userId);
          dedupedUsers.push(user);
        }
      });

      const assignedUsers = [];
      dedupedUsers.forEach((assignedUser) => {
        const analysis = analysisMap.get(assignedUser.userId) || null;
        const matchPercentage = analysis?.resumeMatchPercentage ?? 0;
        const missingSkills = analysis?.missingSkills || [];

        assignedUsers.push({
          userId: assignedUser.userId,
          name: assignedUser.name,
          email: assignedUser.email,
          analysisStatus: analysis ? "analyzed" : "not_analyzed",
          readinessStatus: analysis
            ? computeReadinessStatus(matchPercentage, missingSkills)
            : "Not analyzed",
          resumeMatchPercentage: matchPercentage,
          matchedSkills: analysis?.matchedSkills || [],
          missingSkills,
          suggestions: analysis?.suggestions || [],
          analyzedAt: analysis?.analyzedAt || null,
        });
      });

      return res.json({
        project: {
          _id: project._id,
          title: project.title,
          description: project.description,
          requiredSkills,
          skills: project.skills || [],
          assignedUsers: project.assignedUsers || [],
          tier: project.tier,
        },
        assignedUsers,
      });
    }

    const analysis = await ProjectResumeAnalysis.findOne({
      projectId: project._id,
      userId: req.user._id,
    }).lean();

    return res.json({
      project: {
        _id: project._id,
        title: project.title,
        description: project.description,
        requiredSkills,
        skills: project.skills || [],
        assignedUsers: project.assignedUsers || [],
        tier: project.tier,
      },
      analysis: analysis
        ? {
            ...analysis,
            analysisStatus: "analyzed",
            readinessStatus: computeReadinessStatus(
              analysis.resumeMatchPercentage || 0,
              analysis.missingSkills || []
            ),
          }
        : null,
      prompt: "Analyze your resume to check project readiness",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.analyzeProjectResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Resume PDF is required" });
    }

    const project = req.project;
    console.log("PROJECT REQUIRED:", project?.requiredSkills);

    const requiredSkills = parseSkillsInput(project?.requiredSkills);
    console.log("NORMALIZED REQUIRED:", requiredSkills);

    if (!Array.isArray(requiredSkills) || requiredSkills.length === 0) {
      return res.status(400).json({ message: "Project required skills are missing" });
    }

    const { analysis } = await analyzeResumeFile(req.file.path, req.file.originalname, requiredSkills);
    console.log("PYTHON skills_found:", analysis?.skills_found);
    console.log("RESUME TEXT:", analysis?.resumeText || analysis?.summary || "");

    const foundSkills = normalizeSkills(analysis.skills_found || []);
    const resumeText = String(analysis.resumeText || analysis.summary || "");

    const { normalizedRequiredSkills, normalizedResumeSkills, matchedSkills, missingSkills, matchPercentage } =
      computeMatches(requiredSkills, foundSkills, resumeText);

    console.log("NORMALIZED REQUIRED (computeMatches):", normalizedRequiredSkills);
    console.log("NORMALIZED RESUME TEXT:", String(resumeText || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim());
    console.log("MATCHED:", matchedSkills);
    console.log("MISSING:", missingSkills);
    console.log("PERCENT:", matchPercentage);

    const resumeMatchPercentage = matchPercentage;
    const suggestions = buildSuggestions({
      matchPercentage: resumeMatchPercentage,
      missingSkills,
      projectTitle: project.title || "this project",
    });

    // Debug logging for extraction/matching
    try {
      console.debug("[ProjectResume] extractedSummary:", (analysis.summary || "").slice(0, 500));
      console.debug("[ProjectResume] normalizedRequiredSkills:", normalizedRequiredSkills);
      console.debug("[ProjectResume] normalizedResumeSkills:", normalizedResumeSkills);
      console.debug("HTML exists:", resumeText.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().includes("html"));
      console.debug("Ubuntu exists:", resumeText.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().includes("ubuntu"));
      console.debug("[ProjectResume] matchedSkills:", matchedSkills);
      console.debug("[ProjectResume] matchPercentage:", resumeMatchPercentage);
    } catch (e) {
      // ignore logging errors
    }

    if (req.user.role !== "admin") {
      const user = await User.findById(req.user._id).select("skills");
      if (user) {
        user.skills = foundSkills;
        await user.save();
      }
    }

    const savedAnalysis = await ProjectResumeAnalysis.findOneAndUpdate(
      { userId: req.user._id, projectId: project._id },
      {
        userId: req.user._id,
        projectId: project._id,
        resumeMatchPercentage,
        matchedSkills,
        missingSkills,
        suggestions,
        uploadedResumePath: req.file.path,
        analyzedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // Return the analysis plus a pointer to the saved analysis document (so frontend can keep _id)
    return res.json({
      _id: savedAnalysis._id,
      skills_found: foundSkills,
      required_skills: requiredSkills,
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
      match_percentage: resumeMatchPercentage,
      suggestions,
      readinessStatus: computeReadinessStatus(resumeMatchPercentage, missingSkills),
      uploadedResumePath: savedAnalysis.uploadedResumePath,
      analyzedAt: savedAnalysis.analyzedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.deleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;

    // ❗ Delete all tasks of this project
    await Task.deleteMany({ project: projectId });

    // ❗ Delete project
    await Project.findByIdAndDelete(projectId);

    res.json({ message: "Project and related tasks deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};