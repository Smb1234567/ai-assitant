const { listModels, pullModel } = require("./ollama");

function sortModels(models) {
  return [...models].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}

async function getInstalledModels() {
  const models = await listModels();
  return sortModels(
    models.map((model) => ({
      name: model.name,
      size: model.size,
      modifiedAt: model.modified_at,
      digest: model.digest,
      details: model.details || {},
    }))
  );
}

async function installModel(name, onProgress) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    throw new Error("Model name is required.");
  }

  return pullModel(trimmedName, onProgress);
}

module.exports = {
  getInstalledModels,
  installModel,
};
