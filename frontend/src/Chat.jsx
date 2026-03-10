import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-[24px] px-5 py-4 text-sm leading-7 shadow-sm ${
          isUser
            ? "bg-sand-900 text-sand-100"
            : "border border-sand-300 bg-white text-sand-900"
        }`}
      >
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="space-y-4">
            {message.thinking ? (
              <details className="rounded-2xl border border-ember-400/20 bg-ember-400/8 p-4" open>
                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.16em] text-ember-700">
                  Reasoning Trace
                </summary>
                <div className="mt-3 text-sand-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.thinking}
                  </ReactMarkdown>
                </div>
              </details>
            ) : null}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chat({
  messages,
  selectedModel,
  onSendMessage,
  isStreaming,
  toolState,
}) {
  const [draft, setDraft] = useState("");
  const [useSearch, setUseSearch] = useState(true);
  const [showThinking, setShowThinking] = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  function handleSubmit(event) {
    event.preventDefault();
    if (!draft.trim() || !selectedModel || isStreaming) {
      return;
    }

    onSendMessage({
      content: draft.trim(),
      useSearch,
      think: showThinking,
    });
    setDraft("");
  }

  return (
    <section className="flex min-h-[720px] flex-col rounded-[32px] border border-sand-300/80 bg-white/75 shadow-panel backdrop-blur">
      <div className="border-b border-sand-200 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="m-0 font-display text-2xl text-sand-900">
              Local Assistant
            </h1>
            <p className="mt-1 text-sm text-sand-700">
              Chat runs against your selected Ollama model with optional live web
              search.
            </p>
          </div>
          <div className="rounded-full bg-sand-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-sand-700">
            {selectedModel || "Select a model"}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-sand-700">
          <span
            className={`rounded-full px-3 py-1 ${
              toolState.searchUsed ? "bg-moss-400/15 text-moss-600" : "bg-sand-100"
            }`}
          >
            {toolState.searchUsed ? "Web search used" : "Web search idle"}
          </span>
          <span className="rounded-full bg-sand-100 px-3 py-1">
            {toolState.searchResults.length} search results attached
          </span>
          <span className="rounded-full bg-sand-100 px-3 py-1">
            {toolState.isThinking
              ? "Model reasoning"
              : isStreaming
                ? "Streaming response"
                : "Waiting"}
          </span>
        </div>
      </div>

      <div
        ref={listRef}
        className="scrollbar-soft flex-1 space-y-4 overflow-y-auto px-6 py-5"
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-sand-200 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-sand-700">
              <input
                type="checkbox"
                checked={useSearch}
                onChange={(event) => setUseSearch(event.target.checked)}
                className="h-4 w-4 rounded border-sand-300 text-ember-500 focus:ring-ember-400"
              />
              Use web search for current information
            </label>
            <label className="flex items-center gap-2 text-sm text-sand-700">
              <input
                type="checkbox"
                checked={showThinking}
                onChange={(event) => setShowThinking(event.target.checked)}
                className="h-4 w-4 rounded border-sand-300 text-ember-500 focus:ring-ember-400"
              />
              Show reasoning when supported
            </label>
          </div>
        </div>

        <div className="rounded-[28px] border border-sand-300 bg-sand-100 p-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              selectedModel
                ? "Ask something about the current world, your local files, or a pulled model."
                : "Select an Ollama model first."
            }
            rows={4}
            disabled={!selectedModel || isStreaming}
            className="w-full resize-none border-0 bg-transparent px-2 py-2 text-sm leading-7 text-sand-900 outline-none placeholder:text-sand-700/70"
          />
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={!selectedModel || isStreaming || !draft.trim()}
              className="rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStreaming ? "Generating..." : "Send"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
