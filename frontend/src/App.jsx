import { useEffect, useRef, useState } from "react";
import Chat from "./Chat";
import ModelSelector from "./ModelSelector";
import Upload from "./Upload";
import {
  clearDocuments,
  deleteDocument,
  fetchDocuments,
  fetchModels,
  streamAskDoc,
  streamChat,
  streamPullModel,
  uploadDocument,
} from "./api";

let messageId = 0;
const CHAT_STORAGE_KEY = "ai-desktop-assistant.chat-history";
const MODEL_STORAGE_KEY = "ai-desktop-assistant.selected-model";

function createMessage(role, content) {
  messageId += 1;
  return {
    id: `${role}-${messageId}`,
    role,
    content,
    thinking: "",
    showThinking: true,
  };
}

function getDefaultMessages() {
  return [
    createMessage(
      "assistant",
      "Select an installed Ollama model, or pull a new one, and start chatting."
    ),
  ];
}

function loadStoredMessages() {
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) {
      return getDefaultMessages();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      return getDefaultMessages();
    }

    return parsed.map((message) => ({
      thinking: "",
      showThinking: true,
      ...message,
    }));
  } catch {
    return getDefaultMessages();
  }
}

export default function App() {
  const activeChatAbortRef = useRef(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(
    () => window.localStorage.getItem(MODEL_STORAGE_KEY) || ""
  );
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState(() => loadStoredMessages());
  const [isStreaming, setIsStreaming] = useState(false);
  const [pullState, setPullState] = useState({
    isPulling: false,
    status: "",
  });
  const [uploadState, setUploadState] = useState({
    isUploading: false,
    status: "",
  });
  const [toolState, setToolState] = useState({
    searchUsed: false,
    searchResults: [],
    retrievalUsed: false,
    retrievals: [],
    isThinking: false,
    thinkEnabled: false,
    downgradedFromThink: false,
  });

  async function loadModels(preferredSelection) {
    const data = await fetchModels();
    setModels(data.models);

    const targetModel =
      preferredSelection ||
      (data.models.some((model) => model.name === selectedModel)
        ? selectedModel
        : data.models[0]?.name || "");

    setSelectedModel(targetModel);
  }

  useEffect(() => {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (selectedModel) {
      window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    loadModels().catch((error) => {
      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          `Failed to load Ollama models.\n\n${error.message}`
        ),
      ]);
    });
  }, []);

  useEffect(() => {
    fetchDocuments()
      .then((data) => setDocuments(data.documents || []))
      .catch(() => {
        setDocuments([]);
      });
  }, []);

  async function handlePullModel(name) {
    setPullState({
      isPulling: true,
      status: `Starting download for ${name}...`,
    });

    try {
      await streamPullModel(name, {
        onProgress: (payload) => {
          const hasBytes =
            typeof payload.completed === "number" &&
            typeof payload.total === "number" &&
            payload.total > 0;
          const detail = hasBytes
            ? `${payload.status} (${Math.round(
                (payload.completed / payload.total) * 100
              )}%)`
            : payload.digest
              ? `${payload.status} (${payload.digest.slice(0, 12)})`
              : payload.status;

          setPullState({
            isPulling: true,
            status: detail || `Pulling ${name}...`,
          });
        },
        onDone: async (payload) => {
          if (!payload?.completed) {
            throw new Error("Ollama did not confirm model download completion.");
          }
          await loadModels(name);
          setPullState({
            isPulling: false,
            status: `${name} is ready.`,
          });
        },
      });
    } catch (error) {
      setPullState({
        isPulling: false,
        status: error.message,
      });
    }
  }

  async function handleUploadFile(file) {
    setUploadState({
      isUploading: true,
      status: `Indexing ${file.name}...`,
    });

    try {
      const data = await uploadDocument(file);
      setDocuments((current) => [data.document, ...current]);
      setUploadState({
        isUploading: false,
        status: `${data.document.fileName} indexed with ${data.document.chunkCount} chunks.`,
      });
    } catch (error) {
      setUploadState({
        isUploading: false,
        status: error.message,
      });
    }
  }

  async function handleDeleteDocument(docId) {
    try {
      await deleteDocument(docId);
      setDocuments((current) => current.filter((item) => item.docId !== docId));
      setUploadState({
        isUploading: false,
        status: "Document removed.",
      });
    } catch (error) {
      setUploadState({
        isUploading: false,
        status: error.message,
      });
    }
  }

  async function handleClearDocuments() {
    try {
      await clearDocuments();
      setDocuments([]);
      setUploadState({
        isUploading: false,
        status: "All indexed documents were removed.",
      });
    } catch (error) {
      setUploadState({
        isUploading: false,
        status: error.message,
      });
    }
  }

  async function handleSendMessage({
    content,
    searchMode,
    useDocuments,
    think,
    showThinking,
  }) {
    activeChatAbortRef.current?.abort();
    const abortController = new AbortController();
    activeChatAbortRef.current = abortController;

    const userMessage = createMessage("user", content);
    const assistantMessage = {
      ...createMessage("assistant", ""),
      showThinking,
    };
    const nextMessages = [...messages, userMessage, assistantMessage];

    setMessages(nextMessages);
    setIsStreaming(true);
    setToolState({
      searchUsed: false,
      searchResults: [],
      retrievalUsed: false,
      retrievals: [],
      isThinking: false,
      thinkEnabled: false,
      downgradedFromThink: false,
    });

    try {
      const streamRequest = useDocuments ? streamAskDoc : streamChat;

      await streamRequest(
        {
          model: selectedModel,
          messages: nextMessages
            .filter((message) => message.content.trim())
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
          searchMode,
          think,
        },
        {
          signal: abortController.signal,
          onMeta: (payload) => {
            setToolState((current) => ({
              ...current,
              searchUsed: payload.searchUsed,
              searchResults: payload.searchResults || [],
              retrievalUsed: Boolean(payload.retrievalUsed),
              retrievals: payload.retrievals || [],
              thinkEnabled: Boolean(payload.thinkEnabled),
              downgradedFromThink: Boolean(payload.downgradedFromThink),
            }));
          },
          onThinking: (token) => {
            if (!showThinking) {
              return;
            }
            setToolState((current) => ({
              ...current,
              isThinking: true,
            }));
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, thinking: `${message.thinking}${token}` }
                  : message
              )
            );
          },
          onToken: (token) => {
            setToolState((current) => ({
              ...current,
              isThinking: false,
            }));
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: `${message.content}${token}` }
                  : message
              )
            );
          },
          onDone: () => {
            if (activeChatAbortRef.current === abortController) {
              activeChatAbortRef.current = null;
            }
            setIsStreaming(false);
            setToolState((current) => ({
              ...current,
              isThinking: false,
            }));
          },
        }
      );
    } catch (error) {
      if (error.name === "AbortError") {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content: message.content || "Generation stopped.",
                }
              : message
          )
        );
      } else {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content: `Request failed.\n\n${error.message}`,
                }
              : message
          )
        );
      }
      if (activeChatAbortRef.current === abortController) {
        activeChatAbortRef.current = null;
      }
      setIsStreaming(false);
      setToolState((current) => ({
        ...current,
        isThinking: false,
      }));
    }
  }

  function handleStopStreaming() {
    activeChatAbortRef.current?.abort();
    activeChatAbortRef.current = null;
    setIsStreaming(false);
    setToolState((current) => ({
      ...current,
      isThinking: false,
    }));
  }

  function handleClearChat() {
    const defaultMessages = getDefaultMessages();
    setMessages(defaultMessages);
    window.localStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify(defaultMessages)
    );
  }

  useEffect(() => {
    return () => {
      activeChatAbortRef.current?.abort();
    };
  }, []);

  return (
    <main className="min-h-screen px-5 py-6 text-sand-900 md:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[1480px] gap-6 lg:grid-cols-[1.15fr_380px]">
        <Chat
          messages={messages}
          selectedModel={selectedModel}
          onSendMessage={handleSendMessage}
          onStopStreaming={handleStopStreaming}
          onClearChat={handleClearChat}
          isStreaming={isStreaming}
          toolState={toolState}
          hasDocuments={documents.length > 0}
        />

        <div className="space-y-6">
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            onPullModel={handlePullModel}
            pullState={pullState}
            refreshModels={() => loadModels()}
          />
          <Upload
            documents={documents}
            uploadState={uploadState}
            onUploadFile={handleUploadFile}
            onDeleteDocument={handleDeleteDocument}
            onClearDocuments={handleClearDocuments}
          />
          <section className="rounded-[28px] border border-sand-300/80 bg-white/75 p-5 shadow-panel backdrop-blur">
            <p className="font-display text-lg text-sand-900">Runtime Notes</p>
            <p className="mt-2 text-sm leading-7 text-sand-700">
              Ollama model selection is dynamic. Every chat request sends the full
              message history to the currently selected model through the backend.
              Web search and document retrieval can both be injected as prompt
              context without leaving the chat screen.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
