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

export async function fetchDocuments() {
  const response = await fetch(`${API_BASE_URL}/documents`);
  return parseJsonResponse(response);
}

export async function deleteDocument(docId) {
  const response = await fetch(
    `${API_BASE_URL}/documents/${encodeURIComponent(docId)}`,
    { method: "DELETE" }
  );
  return parseJsonResponse(response);
}

export async function clearDocuments() {
  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "DELETE",
  });
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
  return streamSseRequest("/chat", payload, handlers);
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  return parseJsonResponse(response);
}

export async function streamAskDoc(payload, handlers = {}) {
  return streamSseRequest("/ask-doc", payload, handlers);
}

async function streamSseRequest(path, payload, handlers = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: handlers.signal,
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to start stream.");
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

      const streamPayload = JSON.parse(dataLine);
      if (eventName === "meta") {
        handlers.onMeta?.(streamPayload);
      }
      if (eventName === "token") {
        handlers.onToken?.(streamPayload.content || "");
      }
      if (eventName === "thinking") {
        handlers.onThinking?.(streamPayload.content || "");
      }
      if (eventName === "done") {
        handlers.onDone?.(streamPayload);
      }
      if (eventName === "error") {
        throw new Error(streamPayload.error || "Stream failed.");
      }
    }
  }
}
