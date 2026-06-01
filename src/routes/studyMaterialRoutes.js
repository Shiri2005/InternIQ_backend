const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const StudyMaterial = require("../models/StudyMaterial");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

const studyMaterialsDir = path.join(__dirname, "..", "..", "study-materials");

const tierRank = {
  free: 0,
  pro: 1,
  premium: 2,
};

function hasTierAccess(userTier, requiredTier) {
  return (tierRank[userTier] ?? -1) >= (tierRank[requiredTier] ?? Number.MAX_SAFE_INTEGER);
}

function normalizeStudyMaterialFileUrl(fileUrl, fileName) {
  const normalizedFileName = String(fileName || "").trim();
  const candidate = String(fileUrl || "").trim();

  if (candidate) {
    const normalizedCandidate = candidate.startsWith("/") ? candidate : `/${candidate}`;
    const fileSegment = normalizedCandidate.split("/").pop() || "";

    if (fileSegment && fileSegment !== ".pdf" && fileSegment !== ".") {
      return normalizedCandidate;
    }
  }

  if (!normalizedFileName) {
    return candidate || "";
  }

  return `/study-materials/${normalizedFileName}`;
}

async function resolveAssignedUsers(assignedUsersInput, assignToAllInterns) {
  if (assignToAllInterns) {
    const users = await User.find({ role: "user" }).select("_id");
    return users.map((user) => user._id);
  }

  const assignedIds = Array.isArray(assignedUsersInput) ? assignedUsersInput : [];
  if (assignedIds.length === 0) return [];

  const users = await User.find({ _id: { $in: assignedIds }, role: "user" }).select("_id");
  return users.map((user) => user._id);
}

router.post("/", auth, admin, upload.single("studyPdf"), async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const notes = String(req.body.notes || "").trim();
    const requiredTier = ["free", "pro", "premium"].includes(req.body.requiredTier)
      ? req.body.requiredTier
      : "free";
    const assignToAllInterns = req.body.assignToAllInterns === "true" || req.body.assignToAllInterns === true;
    const assignedUsers = await resolveAssignedUsers(JSON.parse(req.body.assignedUsers || "[]"), assignToAllInterns);

    if (!title) {
      return res.status(400).json({ message: "Study material title is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "PDF file is required" });
    }

    if (!assignToAllInterns && assignedUsers.length === 0) {
      return res.status(400).json({ message: "Assign at least one user" });
    }

    await fs.promises.mkdir(studyMaterialsDir, { recursive: true });

    const fileName = `study_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(studyMaterialsDir, fileName);
    await fs.promises.writeFile(filePath, req.file.buffer);

    const fileUrl = normalizeStudyMaterialFileUrl(`/study-materials/${fileName}`, fileName);

    const material = await StudyMaterial.create({
      title,
      notes,
      requiredTier,
      assignToAllInterns,
      assignedUsers,
      fileName,
      fileUrl,
      createdBy: req.user._id,
    });

    res.status(201).json(material);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const materials = await StudyMaterial.find().populate("assignedUsers", "name email");
      return res.json(
        materials.map((material) => ({
          ...material.toObject(),
          fileUrl: normalizeStudyMaterialFileUrl(material.fileUrl, material.fileName)
        }))
      );
    }

    const materials = await StudyMaterial.find({
      $or: [
        { assignToAllInterns: true },
        { assignedUsers: req.user._id }
      ]
    }).populate("assignedUsers", "name email");

    const visibleMaterials = materials.filter((material) => hasTierAccess(req.user.tier, material.requiredTier));
    res.json(
      visibleMaterials.map((material) => ({
        ...material.toObject(),
        fileUrl: normalizeStudyMaterialFileUrl(material.fileUrl, material.fileName)
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete("/:id", auth, admin, async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ message: "Study material not found" });
    }

    const filePath = path.join(studyMaterialsDir, material.fileName);
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await material.deleteOne();
    res.json({ message: "Study material deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;