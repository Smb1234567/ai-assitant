const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001";

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export async function fetchModels() {
  const response = await fetch(`${API_BASE_URL}/models`);
  return parseJsonResponse(response);
}

export async function searchWeb(query) {
  const response = await fetch(`${API_BASE_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  return parseJsonResponse(response);
}

export async function streamPullModel(name, handlers = {}) {
  const response = await fetch(`${API_BASE_URL}/pull-model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to pull model.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      const lines = rawEvent.split("\n");
      let dataLine = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        }

        if (line.startsWith("data:")) {
          dataLine += line.slice(5).trim();
        }
      }

      if (!dataLine) {
        continue;
      }

      const payload = JSON.parse(dataLine);
      if (eventName === "progress") {
        handlers.onProgress?.(payload);
      }
      if (eventName === "done") {
        handlers.onDone?.(payload);
      }
      if (eventName === "error") {
        throw new Error(payload.error || "Model pull failed.");
      }
    }
  }
}

export async function streamChat(payload, handlers = {}) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to start chat stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      const lines = rawEvent.split("\n");
      let dataLine = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        }

        if (line.startsWith("data:")) {
          dataLine += line.slice(5).trim();
        }
      }

      if (!dataLine) {
        continue;
      }

      const payload = JSON.parse(dataLine);

      if (eventName === "meta") {
        handlers.onMeta?.(payload);
      }
      if (eventName === "token") {
        handlers.onToken?.(payload.content || "");
      }
      if (eventName === "thinking") {
        handlers.onThinking?.(payload.content || "");
      }
      if (eventName === "done") {
        handlers.onDone?.(payload);
      }
      if (eventName === "error") {
        throw new Error(payload.error || "Chat stream failed.");
      }
    }
  }
}
