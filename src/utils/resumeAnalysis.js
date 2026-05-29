const fs = require("fs");
const pdfParse = require("pdf-parse");
const { analyzeResume } = require("../services/aiService");

console.log("pdfParse type:", typeof pdfParse);

let mammoth = null;
try {
  mammoth = require("mammoth");
} catch (e) {
  // mammoth is optional; DOCX support will be best-effort
}

function normalizeSkills(value) {
  const normalizeToken = (token) =>
    String(token || "")
      .toLowerCase()
      .trim()
      .replace(/[\n\r]+/g, " ")
      .replace(/[,;|\/\\]+/g, " ")
      .replace(/[^a-z0-9 ]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

  if (!value) return [];

  if (Array.isArray(value)) {
    return [...new Set(value.map((skill) => normalizeToken(skill)).filter(Boolean))];
  }

  return [...new Set(String(value)
    .split(/[\n,]/)
    .map((skill) => normalizeToken(skill))
    .filter(Boolean))];
}

function canonicalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function skillsMatchFlexible(leftSkill, rightSkill) {
  const leftNormalized = String(leftSkill || "").toLowerCase().trim().replace(/\s+/g, " ");
  const rightNormalized = String(rightSkill || "").toLowerCase().trim().replace(/\s+/g, " ");

  if (!leftNormalized || !rightNormalized) {
    return false;
  }

  const leftCanonical = canonicalizeForMatch(leftNormalized);
  const rightCanonical = canonicalizeForMatch(rightNormalized);

  return (
    leftNormalized.includes(rightNormalized) ||
    rightNormalized.includes(leftNormalized) ||
    leftCanonical.includes(rightCanonical) ||
    rightCanonical.includes(leftCanonical)
  );
}

function extractSkillsFromText(text, skillPool) {
  const normalizedText = String(text || "").toLowerCase();

  // Build a small known-skills list to catch common skills even if skillPool is missing
  const defaultKnown = [
    "html",
    "css",
    "javascript",
    "react",
    "node",
    "mongodb",
    "aws",
    "aws ec2",
    "ubuntu",
    "ubuntu linux",
    "flask",
  ];

  const pool = [...new Set([...(normalizeSkills(skillPool) || []), ...defaultKnown])];

  const poolNormalized = normalizeSkills(pool);
  const found = [];
  poolNormalized.forEach((skill) => {
    try {
      if (!skill) return;
      if (skillsMatchFlexible(normalizedText, skill)) {
        found.push(skill);
      }
    } catch (e) {
      // ignore individual skill match errors
    }
  });

  return [...new Set(found)];
}

async function extractResumeText(fileBuffer, fileName) {
  const ext = String(fileName || "").toLowerCase().split(".").pop() || "";
  // Try PDF first
  if (ext === "pdf" || ext === "") {
    try {
      const parsed = await pdfParse(fileBuffer);
      const parsedText = String(parsed.text || "");
      // Log the extracted PDF text explicitly for diagnosis
      console.log("EXTRACTED PDF TEXT:");
      console.log(parsedText);
      // Also log parsed.text under the requested label for easy grepping
      console.log("PDF TEXT:", parsed.text);
      return parsedText;
    } catch (e) {
      // For PDFs: do NOT fallback to raw UTF-8 decoding. Return empty string and log clean error.
      console.debug("pdfParse failed:", e?.message || e);
      console.log("EXTRACTED PDF TEXT: <PARSE FAILED>");
      return "";
    }
  }

  // Try DOCX via mammoth if available
  if (ext === "docx" && mammoth) {
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return String(result.value || "");
    } catch (e) {
      console.debug("mammoth.extractRawText failed:", e?.message || e);
    }
  }

  // Last-resort for non-PDFs: decode buffer as utf8 and strip binary
  try {
    return fileBuffer.toString("utf8", 0, Math.min(fileBuffer.length, 200000));
  } catch (e) {
    return "";
  }
}

async function analyzeResumeLocally(fileBuffer, skillPool, fileName) {
  const extractedTextRaw = await extractResumeText(fileBuffer, fileName || "");

  // Normalize extracted text for searching
  const extractedText = String(extractedTextRaw || "")
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  console.log("RAW RESUME TEXT:");
  console.log(extractedTextRaw);
  console.log("NORMALIZED RESUME TEXT:");
  console.log(extractedText);
  console.log("Contains html:", extractedText.includes("html"));
  console.log("Contains ubuntu:", extractedText.includes("ubuntu"));
  console.log("Contains css:", extractedText.includes("css"));
  console.log("Contains aws:", extractedText.includes("aws"));

  console.debug("[ResumeAnalyzer] extractedText snippet:", extractedText.substring(0, 500));

  const skillsFound = extractSkillsFromText(extractedText, skillPool);
  const pool = normalizeSkills(skillPool || []);

  // normalize extracted skills as well
  const normalizedResumeSkills = normalizeSkills(skillsFound || []);

  console.debug("[ResumeAnalyzer] normalizedRequiredSkills:", pool);
  console.debug("[ResumeAnalyzer] normalizedResumeSkills:", normalizedResumeSkills);

  // Compute which required pool items are matched by the extracted text or extracted skills
  const matched = [];
  pool.forEach((required) => {
    try {
      if (!required) return;
      const byFound = skillsFound.some((s) => skillsMatchFlexible(s, required));
      const byText = skillsMatchFlexible(extractedText, required);
      if (byFound || byText) matched.push(required);
    } catch (e) {}
  });

  const uniqueMatched = [...new Set(matched.map((m) => String(m).toLowerCase()))];
  const missing = pool.filter((p) => !uniqueMatched.some((m) => skillsMatchFlexible(m, p)));
  const matchPercentage = pool.length > 0 ? Math.round((uniqueMatched.length / pool.length) * 100) : 0;

  return {
    skills_found: [...new Set(normalizedResumeSkills)],
    matched_skills: uniqueMatched,
    missing_skills: missing,
    match_percentage: matchPercentage,
    resumeText: extractedText,
    summary: extractedText.trim().slice(0, 500),
    skill_pool: pool,
  };
}

function computeMatches(requiredSkills, extractedSkills, resumeText) {
  const normalize = (s) =>
    String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ");

  console.log("[computeMatches] requiredSkills input:", requiredSkills);
  console.log("[computeMatches] extractedSkills input:", extractedSkills);
  console.log("[computeMatches] resumeText input:", resumeText);

  const normalizedRequired = (requiredSkills || []).map(normalize).filter(Boolean);
  const normalizedResume = (extractedSkills || []).map(normalize).filter(Boolean);
  const normalizedText = String(resumeText || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  console.log("[computeMatches] normalizedRequired:", normalizedRequired);
  console.log("[computeMatches] normalizedResume:", normalizedResume);
  console.log("[computeMatches] normalizedText:", normalizedText);

  const matched = normalizedRequired.filter((req) => {
    const byResume = normalizedResume.some((res) => res.includes(req) || req.includes(res));
    const byText = normalizedText.includes(req) || (req.split(" ")[0] && normalizedText.includes(req.split(" ")[0]));
    return byResume || byText;
  });

  const uniqueMatched = [...new Set(matched)];
  const missing = normalizedRequired.filter((r) => !uniqueMatched.includes(r));
  const matchPercentage = normalizedRequired.length > 0 ? Math.round((uniqueMatched.length / normalizedRequired.length) * 100) : 0;

  console.log("[computeMatches] matchedSkills:", uniqueMatched);
  console.log("[computeMatches] missingSkills:", missing);
  console.log("[computeMatches] matchPercentage:", matchPercentage);

  return {
    normalizedRequiredSkills: normalizedRequired,
    normalizedResumeSkills: normalizedResume,
    matchedSkills: uniqueMatched,
    missingSkills: missing,
    matchPercentage,
  };
}

async function analyzeResumeFile(filePath, fileName, skillPool) {
  const fileBuffer = fs.readFileSync(filePath);

  let analysis;

  try {
    analysis = await analyzeResume({
      fileBuffer,
      fileName,
      skillPool,
    });
  } catch {
    analysis = await analyzeResumeLocally(fileBuffer, skillPool, fileName);
  }

  // If external service returned no skills, force local analysis and log details
  if (!Array.isArray(analysis.skills_found) || analysis.skills_found.length === 0) {
    console.debug("[ResumeAnalyzer] external service returned no skills, falling back to local analyzer");
    analysis = await analyzeResumeLocally(fileBuffer, skillPool, fileName);
  }

  // Log final analysis debug info
  try {
    console.debug("[ResumeAnalyzer] final analysis.skills_found:", analysis.skills_found || []);
    console.debug("[ResumeAnalyzer] skill_pool:", normalizeSkills(skillPool));
  } catch (e) {
    /* ignore */
  }

  return {
    analysis,
    fileBuffer,
  };
}

function buildSuggestions({ matchPercentage, missingSkills, projectTitle }) {
  const suggestions = [];

  if (matchPercentage >= 80) {
    suggestions.push(`Resume is ready for ${projectTitle}. Continue with confidence.`);
  } else if (matchPercentage >= 50) {
    suggestions.push(`You are close to being ready for ${projectTitle}. Review the remaining gaps.`);
  } else {
    suggestions.push(`Focus on the core project skills before starting ${projectTitle}.`);
  }

  if (missingSkills.length > 0) {
    suggestions.push(`Improve ${missingSkills.slice(0, 3).join(", ")} to raise the match score.`);
  }

  return suggestions;
}

function computeReadinessStatus(matchPercentage, missingSkills) {
  if (matchPercentage >= 80 && missingSkills.length === 0) {
    return "Ready";
  }

  if (matchPercentage >= 50) {
    return "Improvement recommended";
  }

  return "Needs more skills";
}

module.exports = {
  analyzeResumeFile,
  buildSuggestions,
  canonicalizeForMatch,
  computeReadinessStatus,
  skillsMatchFlexible,
  normalizeSkills,
  analyzeResumeLocally,
  extractResumeText,
  computeMatches,
};