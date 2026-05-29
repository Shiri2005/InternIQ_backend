const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8001";

async function readJsonResponse(response) {
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || "AI service returned an invalid response" };
  }

  if (!response.ok) {
    throw new Error(data.message || `AI service request failed (${response.status})`);
  }

  return data;
}

async function postJson(path, payload) {
  const response = await fetch(`${AI_SERVICE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJsonResponse(response);
}

exports.predictSuccess = async (features) => {
  const result = await postJson("/predict-success", features);
  return result.success_probability ?? 0;
};

exports.recommendProjects = async ({ userSkills, projects }) => {
  const result = await postJson("/recommend-projects", {
    user_skills: userSkills,
    projects,
  });

  return result.recommendations || [];
};

exports.analyzeResume = async ({ fileBuffer, fileName, skillPool }) => {
  const response = await fetch(`${AI_SERVICE_URL}/analyze-resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_name: fileName,
      file_base64: fileBuffer.toString("base64"),
      skill_pool: skillPool,
    }),
  });

  return readJsonResponse(response);
};

exports.getAiServiceUrl = () => AI_SERVICE_URL;
