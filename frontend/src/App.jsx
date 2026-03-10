import { useEffect, useState } from "react";
import Chat from "./Chat";
import ModelSelector from "./ModelSelector";
import Upload from "./Upload";
import { fetchModels, streamChat, streamPullModel } from "./api";

let messageId = 0;

function createMessage(role, content) {
  messageId += 1;
  return {
    id: `${role}-${messageId}`,
    role,
    content,
    thinking: "",
  };
}

export default function App() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [messages, setMessages] = useState([
    createMessage(
      "assistant",
      "Select an installed Ollama model, or pull a new one, and start chatting."
    ),
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pullState, setPullState] = useState({
    isPulling: false,
    status: "",
  });
  const [toolState, setToolState] = useState({
    searchUsed: false,
    searchResults: [],
    isThinking: false,
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

  async function handlePullModel(name) {
    setPullState({
      isPulling: true,
      status: `Starting download for ${name}...`,
    });

    try {
      await streamPullModel(name, {
        onProgress: (payload) => {
          const detail = payload.completed && payload.total
            ? `${payload.status} (${Math.round(
                (payload.completed / payload.total) * 100
              )}%)`
            : payload.status;

          setPullState({
            isPulling: true,
            status: detail || `Pulling ${name}...`,
          });
        },
        onDone: async () => {
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

  async function handleSendMessage({ content, useSearch, think }) {
    const userMessage = createMessage("user", content);
    const assistantMessage = createMessage("assistant", "");
    const nextMessages = [...messages, userMessage, assistantMessage];

    setMessages(nextMessages);
    setIsStreaming(true);
    setToolState({
      searchUsed: false,
      searchResults: [],
      isThinking: false,
    });

    try {
      await streamChat(
        {
          model: selectedModel,
          messages: nextMessages
            .filter((message) => message.content.trim())
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
          useSearch,
          think,
        },
        {
          onMeta: (payload) => {
            setToolState((current) => ({
              ...current,
              searchUsed: payload.searchUsed,
              searchResults: payload.searchResults || [],
            }));
          },
          onThinking: (token) => {
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
            setIsStreaming(false);
            setToolState((current) => ({
              ...current,
              isThinking: false,
            }));
          },
        }
      );
    } catch (error) {
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
      setIsStreaming(false);
      setToolState((current) => ({
        ...current,
        isThinking: false,
      }));
    }
  }

  return (
    <main className="min-h-screen px-5 py-6 text-sand-900 md:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[1480px] gap-6 lg:grid-cols-[1.15fr_380px]">
        <Chat
          messages={messages}
          selectedModel={selectedModel}
          onSendMessage={handleSendMessage}
          isStreaming={isStreaming}
          toolState={toolState}
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
          <Upload />
          <section className="rounded-[28px] border border-sand-300/80 bg-white/75 p-5 shadow-panel backdrop-blur">
            <p className="font-display text-lg text-sand-900">Runtime Notes</p>
            <p className="mt-2 text-sm leading-7 text-sand-700">
              Ollama model selection is dynamic. Every chat request sends the full
              message history to the currently selected model through the backend.
              Web search context is inserted only when the query looks time-sensitive.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
