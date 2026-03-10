const axios = require("axios");

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const DEFAULT_REQUEST_TIMEOUT = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);

const ollamaClient = axios.create({
  baseURL: `${OLLAMA_BASE_URL}/api`,
  timeout: DEFAULT_REQUEST_TIMEOUT,
});

async function listModels() {
  const response = await ollamaClient.get("/tags");
  return response.data.models || [];
}

async function pullModel(name, onProgress) {
  const response = await ollamaClient.post(
    "/pull",
    { name, stream: true },
    {
      responseType: "stream",
      timeout: 0,
    }
  );

  return new Promise((resolve, reject) => {
    let buffer = "";
    let lastEvent = null;

    response.data.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const parts = buffer.split("\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        if (!part.trim()) {
          continue;
        }

        try {
          const event = JSON.parse(part);
          lastEvent = event;
          if (onProgress) {
            onProgress(event);
          }
        } catch (error) {
          reject(
            new Error(`Failed to parse Ollama pull progress payload: ${error.message}`)
          );
        }
      }
    });

    response.data.on("end", () => resolve(lastEvent));
    response.data.on("error", reject);
  });
}

async function chat({ model, messages, stream = false, options }) {
  const response = await ollamaClient.post(
    "/chat",
    {
      model,
      messages,
      stream,
      options,
    },
    stream
      ? {
          responseType: "stream",
          timeout: 0,
        }
      : undefined
  );

  return response.data;
}

async function embed({ model, input }) {
  const response = await ollamaClient.post("/embed", {
    model,
    input,
  });

  return response.data.embeddings || [];
}

module.exports = {
  OLLAMA_BASE_URL,
  chat,
  embed,
  listModels,
  pullModel,
};
