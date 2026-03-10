const express = require("express");
const cors = require("cors");

const { chat, OLLAMA_BASE_URL } = require("./ollama");
const { getInstalledModels, installModel } = require("./models");
const {
  buildSearchContext,
  requiresWebSearch,
  searchDuckDuckGo,
} = require("./search");

const PORT = Number(process.env.PORT || 3001);
const app = express();

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
  const { model, messages, useSearch, temperature } = req.body || {};

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
    if (useSearch && lastUserMessage && requiresWebSearch(lastUserMessage.content)) {
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

    const ollamaStream = await chat({
      model,
      messages: normalizedMessages,
      stream: true,
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

app.post("/upload", (_req, res) => {
  res.status(501).json({
    error: "Document ingestion is not implemented yet.",
  });
});

app.post("/ask-doc", (_req, res) => {
  res.status(501).json({
    error: "Document RAG querying is not implemented yet.",
  });
});

app.listen(PORT, () => {
  console.log(`AI assistant backend listening on http://localhost:${PORT}`);
});
