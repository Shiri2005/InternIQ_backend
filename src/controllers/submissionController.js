const Submission = require("../models/Submission");
const PDFDocument = require("pdfkit"); // ✅ NEW
const fs = require("fs"); // ✅ NEW
const path = require("path"); // ✅ NEW
const Task = require("../models/Task");
// Student submits work
exports.createSubmission = async (req, res) => {
  try {
    // ✅ CHECK EXISTING
    const existing = await Submission.findOne({
      project: req.body.project,
      user: req.user._id,
    });

    if (existing) {
      return res.status(400).json({
        message: "You already submitted this project",
      });
    }

    const submission = await Submission.create({
      project: req.body.project,
      user: req.user._id,
      task: req.body.task,
      description: req.body.description,
      fileUrl: req.body.fileUrl,
    });

    res.status(201).json(submission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin reviews
exports.reviewSubmission = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate("user", "name")
      .populate("project", "title");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    submission.score = req.body.score;
    submission.feedback = req.body.feedback;
    submission.status = "reviewed";

await Task.findByIdAndUpdate(submission.task, {
  status: "completed",
});
    // 🔥 CERTIFICATE — landscape, formal layout; stream must finish before save
    if (req.body.score >= 60) {
      const fileName = `cert_${submission.user._id}_${submission.project._id}_${Date.now()}.pdf`;
      const certsDir = path.join(__dirname, "..", "..", "certificates");
      const filePath = path.join(certsDir, fileName);

      await fs.promises.mkdir(certsDir, { recursive: true });
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }

      /* Letter landscape: wide certificate */
      const doc = new PDFDocument({
        size: [792, 612],
        margin: 0,
        info: {
          Title: "Cynaris Internship Certificate",
          Author: "Cynaris",
        },
      });
      const writeStream = fs.createWriteStream(filePath);
      const writeDone = new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });
      doc.pipe(writeStream);

      const W = doc.page.width;
      const H = doc.page.height;
      const pad = 36;
      const innerW = W - pad * 2;
      const innerH = H - pad * 2;

      const issued = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      /* Page background */
      doc.save();
      doc.rect(0, 0, W, H).fill("#e2e8f0");
      doc.restore();

      /* Drop shadow + card (plain rects — widest PDF viewer support) */
      doc.save();
      doc.fillColor("#94a3b8");
      doc.rect(pad + 4, pad + 4, innerW, innerH).fill();
      doc.restore();

      doc.save();
      doc.fillColor("#ffffff");
      doc.rect(pad, pad, innerW, innerH).fill();
      doc.restore();

      doc.save();
      doc.lineWidth(3);
      doc.strokeColor("#0f766e");
      doc.rect(pad + 6, pad + 6, innerW - 12, innerH - 12).stroke();
      doc.lineWidth(1);
      doc.strokeColor("#5eead4");
      doc.rect(pad + 12, pad + 12, innerW - 24, innerH - 24).stroke();
      doc.restore();

      const logoPath = path.join(__dirname, "..", "..", "assets", "cynaris-logo.png");
      const hasLogo = fs.existsSync(logoPath);

      /* Top banner — tall enough for logo + titles on teal */
      const bannerH = hasLogo ? 172 : 128;
      doc.save();
      doc.fillColor("#115e59");
      doc.rect(pad, pad, innerW, bannerH).fill();
      doc.fillColor("#0d9488");
      doc.rect(pad, pad + bannerH - 10, innerW, 10).fill();
      doc.restore();
      if (hasLogo) {
        doc.image(logoPath, (W - 140) / 2, pad + 14, { fit: [140, 48] });
      }

      const subheadY = hasLogo ? pad + 78 : pad + 28;
      doc.fillColor("#ecfdf5");
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text("C Y N A R I S   I N T E R N S H I P", pad, subheadY, {
        width: innerW,
        align: "center",
      });

      doc.font("Times-Bold").fontSize(26);
      doc.text("Certificate of Completion", pad, subheadY + 18, {
        width: innerW,
        align: "center",
      });

      doc.font("Helvetica-Oblique").fontSize(10);
      doc.fillColor("#ccfbf1");
      doc.text("Awarded for outstanding project completion", pad, subheadY + 52, {
        width: innerW,
        align: "center",
      });

      /* Body area */
      const bodyTop = pad + bannerH + 28;
      doc.fillColor("#64748b");
      doc.font("Times-Italic").fontSize(13);
      doc.text("This is to certify that", pad + 48, bodyTop, {
        width: innerW - 96,
        align: "center",
      });

      doc.fillColor("#0f172a");
      doc.font("Times-Bold").fontSize(28);
      doc.text(submission.user.name, pad + 48, bodyTop + 26, {
        width: innerW - 96,
        align: "center",
      });

      doc.moveTo(pad + innerW / 2 - 120, bodyTop + 62)
        .lineTo(pad + innerW / 2 + 120, bodyTop + 62)
        .lineWidth(0.75)
        .strokeColor("#0d9488")
        .stroke();

      doc.fillColor("#475569");
      doc.font("Helvetica").fontSize(12);
      doc.text("has successfully completed the internship project", pad + 48, bodyTop + 74, {
        width: innerW - 96,
        align: "center",
      });

      /* Project highlight box */
      const boxY = bodyTop + 108;
      const boxPad = 56;
      doc.save();
      doc.fillColor("#f0fdfa");
      doc.rect(pad + boxPad, boxY, innerW - boxPad * 2, 52).fill();
      doc.lineWidth(1.2);
      doc.strokeColor("#14b8a6");
      doc.rect(pad + boxPad, boxY, innerW - boxPad * 2, 52).stroke();
      doc.restore();

      doc.fillColor("#134e4a");
      doc.font("Helvetica-Bold").fontSize(14);
      doc.text(`« ${submission.project.title} »`, pad + boxPad + 12, boxY + 17, {
        width: innerW - boxPad * 2 - 24,
        align: "center",
      });

      /* Score badge */
      const badgeX = W / 2 - 42;
      const badgeY = boxY + 72;
      doc.circle(badgeX + 42, badgeY + 28, 42).fill("#0d9488");
      doc.fillColor("#ffffff");
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text("SCORE", badgeX, badgeY + 10, { width: 84, align: "center" });
      doc.font("Helvetica-Bold").fontSize(22);
      doc.text(String(req.body.score), badgeX, badgeY + 26, { width: 84, align: "center" });

      /* Footer */
      const footY = H - pad - 72;
      doc.fillColor("#64748b");
      doc.font("Helvetica").fontSize(9);
      doc.text(`Issued on ${issued}`, pad + 24, footY, { width: 200, align: "left" });

      doc.moveTo(W - pad - 200, footY + 32)
        .lineTo(W - pad - 24, footY + 32)
        .lineWidth(0.5)
        .strokeColor("#94a3b8")
        .stroke();
      doc.font("Helvetica").fontSize(8);
      doc.fillColor("#64748b");
      doc.text("Authorized signatory — Cynaris Internship", W - pad - 200, footY + 36, {
        width: 176,
        align: "right",
      });

      doc.fillColor("#94a3b8");
      doc.font("Helvetica").fontSize(8);
      doc.text(
        "This document verifies completion of the stated project. Verify authenticity with Cynaris.",
        pad + 24,
        footY + 52,
        { width: innerW - 48, align: "center" }
      );

      doc.end();
      await writeDone;

      submission.isCertified = true;
      submission.certificateUrl = `/certificates/${fileName}`;
    }

    await submission.save();

    res.json(submission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all submissions (Admin)
exports.getSubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find()
      .populate("user", "name email")
      .populate("project", "title")
      .populate("task", "title");
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSubmissionsByProject = async (req, res) => {
  try {
    const submissions = await Submission.find({
      project: req.params.projectId,
    }).populate("userId", "name email");

    res.json(submissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMySubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find({
      user: req.user._id,
    });

    res.json(submissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};