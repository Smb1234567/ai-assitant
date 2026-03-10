const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const multer = require("multer");
const path = require("path");

const { chat, OLLAMA_BASE_URL } = require("./ollama");
const { getInstalledModels, installModel } = require("./models");
const {
  buildSearchContext,
  requiresWebSearch,
  searchDuckDuckGo,
} = require("./search");
const { ingestDocument } = require("./rag/ingest");
const {
  getIndexedDocuments,
  retrieveRelevantChunks,
  streamDocumentAnswer,
} = require("./rag/retrieve");

const PORT = Number(process.env.PORT || 3001);
const app = express();
const upload = multer({
  dest: path.resolve(__dirname, "../uploads"),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json({ limit: "4mb" }));

function sendError(res, error, fallbackStatus = 500) {
  const status = error.response?.status || fallbackStatus;
  const message =
    error.response?.data?.error || error.message || "Unexpected server error.";

  res.status(status).json({ error: message });
}

function writeSseEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function startChatWithThinkFallback({ model, messages, think, options }) {
  try {
    const stream = await chat({
      model,
      messages,
      stream: true,
      think,
      options,
    });

    return {
      stream,
      thinkEnabled: Boolean(think),
    };
  } catch (error) {
    const status = error.response?.status;
    if (!think || status !== 400) {
      throw error;
    }

    const stream = await chat({
      model,
      messages,
      stream: true,
      options,
    });

    return {
      stream,
      thinkEnabled: false,
      downgradedFromThink: true,
    };
  }
}

async function startDocumentAnswerWithThinkFallback({
  model,
  messages,
  retrievals,
  think,
  temperature,
}) {
  try {
    const stream = await streamDocumentAnswer({
      model,
      messages,
      retrievals,
      think,
      temperature,
    });

    return {
      stream,
      thinkEnabled: Boolean(think),
    };
  } catch (error) {
    const status = error.response?.status;
    if (!think || status !== 400) {
      throw error;
    }

    const stream = await streamDocumentAnswer({
      model,
      messages,
      retrievals,
      temperature,
    });

    return {
      stream,
      thinkEnabled: false,
      downgradedFromThink: true,
    };
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    ollamaBaseUrl: OLLAMA_BASE_URL,
  });
});

app.get("/models", async (_req, res) => {
  try {
    const models = await getInstalledModels();
    res.json({ models });
  } catch (error) {
    sendError(res, error, 502);
  }
});

app.get("/documents", async (_req, res) => {
  try {
    const documents = await getIndexedDocuments();
    res.json({ documents });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/pull-model", async (req, res) => {
  const { name } = req.body || {};

  if (!String(name || "").trim()) {
    return res.status(400).json({ error: "Model name is required." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const finalEvent = await installModel(name, (progressEvent) => {
      writeSseEvent(res, "progress", progressEvent);
    });

    writeSseEvent(res, "done", {
      name,
      status: finalEvent?.status || "success",
    });
    res.end();
  } catch (error) {
    writeSseEvent(res, "error", {
      error: error.message || "Failed to pull model.",
    });
    res.end();
  }
});

app.post("/chat", async (req, res) => {
  const { model, messages, searchMode, temperature, think } = req.body || {};

  if (!model) {
    return res.status(400).json({ error: "Model is required." });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages are required." });
  }

  const normalizedMessages = [...messages];
  const lastUserMessage = [...normalizedMessages]
    .reverse()
    .find((message) => message.role === "user");

  let searchResults = [];
  let searchUsed = false;

  try {
    const shouldSearch =
      searchMode === "always" ||
      (searchMode === "auto" &&
        lastUserMessage &&
        requiresWebSearch(lastUserMessage.content));

    if (shouldSearch && lastUserMessage) {
      searchResults = await searchDuckDuckGo(lastUserMessage.content, 5);
      if (searchResults.length > 0) {
        searchUsed = true;
        normalizedMessages.splice(normalizedMessages.length - 1, 0, {
          role: "system",
          content: `Context from web search:\n${buildSearchContext(
            searchResults
          )}\n\nAnswer using only the provided context when referencing current information.`,
        });
      }
    }

    const { stream: ollamaStream, thinkEnabled, downgradedFromThink } =
      await startChatWithThinkFallback({
        model,
        messages: normalizedMessages,
        think,
        options: {
          temperature: typeof temperature === "number" ? temperature : 0.7,
        },
      });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    writeSseEvent(res, "meta", {
      searchUsed,
      searchResults,
      model,
      thinkEnabled,
      downgradedFromThink: Boolean(downgradedFromThink),
    });

    req.on("close", () => {
      if (!res.writableEnded) {
        ollamaStream.destroy();
      }
    });

    let buffer = "";

    ollamaStream.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const payload = JSON.parse(line);
          const content = payload.message?.content || "";
          const thinking = payload.message?.thinking || "";

          if (thinking) {
            writeSseEvent(res, "thinking", { content: thinking });
          }

          if (content) {
            writeSseEvent(res, "token", { content });
          }

          if (payload.done) {
            writeSseEvent(res, "done", {
              done: true,
              totalDuration: payload.total_duration,
              evalCount: payload.eval_count,
            });
            res.end();
          }
        } catch (error) {
          writeSseEvent(res, "error", {
            error: `Failed to parse Ollama stream: ${error.message}`,
          });
          res.end();
        }
      }
    });

    ollamaStream.on("end", () => {
      if (!res.writableEnded) {
        writeSseEvent(res, "done", { done: true });
        res.end();
      }
    });

    ollamaStream.on("error", (error) => {
      if (!res.writableEnded) {
        writeSseEvent(res, "error", {
          error: error.message || "Chat stream failed.",
        });
        res.end();
      }
    });
  } catch (error) {
    sendError(res, error, 502);
  }
});

app.post("/search", async (req, res) => {
  const { query } = req.body || {};

  if (!query) {
    return res.status(400).json({ error: "Query is required." });
  }

  try {
    const results = await searchDuckDuckGo(query, 5);
    res.json({
      results,
      context: buildSearchContext(results),
    });
  } catch (error) {
    sendError(res, error, 502);
  }
});

app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "A file upload is required." });
  }

  try {
    const document = await ingestDocument(req.file);
    res.json({ document });
  } catch (error) {
    sendError(res, error, 400);
  } finally {
    await fs.unlink(req.file.path).catch(() => {});
  }
});

app.post("/ask-doc", async (req, res) => {
  const { model, messages, think, temperature, searchMode } = req.body || {};

  if (!model) {
    return res.status(400).json({ error: "Model is required." });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages are required." });
  }

  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  if (!lastUserMessage?.content) {
    return res.status(400).json({ error: "A user question is required." });
  }

  try {
    const retrievals = await retrieveRelevantChunks(lastUserMessage.content, 3);
    if (!retrievals.length) {
      return res.status(400).json({
        error: "No indexed document chunks were available for retrieval.",
      });
    }

    let searchResults = [];
    let searchUsed = false;
    const shouldSearch =
      searchMode === "always" ||
      (searchMode === "auto" &&
        requiresWebSearch(lastUserMessage.content));

    if (shouldSearch) {
      searchResults = await searchDuckDuckGo(lastUserMessage.content, 5);
      searchUsed = searchResults.length > 0;
    }

    const {
      stream: ollamaStream,
      thinkEnabled,
      downgradedFromThink,
    } = await startDocumentAnswerWithThinkFallback({
      model,
      messages,
      retrievals,
      searchResults,
      think,
      temperature,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    writeSseEvent(res, "meta", {
      searchUsed,
      searchResults,
      retrievalUsed: true,
      retrievals,
      model,
      thinkEnabled,
      downgradedFromThink: Boolean(downgradedFromThink),
    });

    req.on("close", () => {
      if (!res.writableEnded) {
        ollamaStream.destroy();
      }
    });

    let buffer = "";
    ollamaStream.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const payload = JSON.parse(line);
          const content = payload.message?.content || "";
          const thinking = payload.message?.thinking || "";

          if (thinking) {
            writeSseEvent(res, "thinking", { content: thinking });
          }
          if (content) {
            writeSseEvent(res, "token", { content });
          }
          if (payload.done) {
            writeSseEvent(res, "done", {
              done: true,
              totalDuration: payload.total_duration,
              evalCount: payload.eval_count,
            });
            res.end();
          }
        } catch (error) {
          writeSseEvent(res, "error", {
            error: `Failed to parse Ollama stream: ${error.message}`,
          });
          res.end();
        }
      }
    });

    ollamaStream.on("end", () => {
      if (!res.writableEnded) {
        writeSseEvent(res, "done", { done: true });
        res.end();
      }
    });

    ollamaStream.on("error", (error) => {
      if (!res.writableEnded) {
        writeSseEvent(res, "error", {
          error: error.message || "Document answer stream failed.",
        });
        res.end();
      }
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.listen(PORT, () => {
  console.log(`AI assistant backend listening on http://localhost:${PORT}`);
});
