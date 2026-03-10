import { useState } from "react";

function formatSize(bytes) {
  if (!bytes) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function ModelSelector({
  models,
  selectedModel,
  onSelectModel,
  onPullModel,
  pullState,
  refreshModels,
}) {
  const [modelName, setModelName] = useState("");

  const hasModels = models.length > 0;
  const selectedDetails = models.find((model) => model.name === selectedModel);

  function handlePullSubmit(event) {
    event.preventDefault();
    if (!modelName.trim()) {
      return;
    }
    onPullModel(modelName.trim());
  }

  return (
    <section className="rounded-[28px] border border-sand-300/80 bg-white/80 p-5 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-lg text-sand-900">Model Runtime</p>
          <p className="text-sm text-sand-700">
            Installed models are loaded from Ollama at startup.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshModels}
          className="rounded-full border border-sand-300 px-4 py-2 text-sm font-medium text-sand-900 transition hover:border-sand-700"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="text-sm font-medium text-sand-700" htmlFor="model-select">
          Active model
        </label>
        <select
          id="model-select"
          value={selectedModel}
          onChange={(event) => onSelectModel(event.target.value)}
          className="rounded-2xl border border-sand-300 bg-sand-100 px-4 py-3 text-sand-900 outline-none ring-0 transition focus:border-ember-500"
        >
          <option value="" disabled>
            {hasModels ? "Choose a model" : "No installed models found"}
          </option>
          {models.map((model) => (
            <option key={model.name} value={model.name}>
              {model.name}
            </option>
          ))}
        </select>

        {selectedDetails ? (
          <div className="rounded-2xl bg-sand-100 px-4 py-3 text-sm text-sand-700">
            <span className="font-medium text-sand-900">{selectedDetails.name}</span>
            {" • "}
            {formatSize(selectedDetails.size)}
          </div>
        ) : null}
      </div>

      <form className="mt-5 grid gap-3" onSubmit={handlePullSubmit}>
        <label className="text-sm font-medium text-sand-700" htmlFor="pull-model-name">
          Pull a new model
        </label>
        <div className="flex gap-3">
          <input
            id="pull-model-name"
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
            placeholder="mistral:7b"
            className="flex-1 rounded-2xl border border-sand-300 bg-white px-4 py-3 text-sand-900 outline-none transition focus:border-ember-500"
          />
          <button
            type="submit"
            disabled={pullState.isPulling}
            className="rounded-2xl bg-sand-900 px-5 py-3 text-sm font-semibold text-sand-100 transition hover:bg-ember-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pullState.isPulling ? "Pulling..." : "Pull"}
          </button>
        </div>

        {pullState.status ? (
          <div className="rounded-2xl bg-moss-400/10 px-4 py-3 text-sm text-sand-900">
            {pullState.status}
          </div>
        ) : null}
      </form>
    </section>
  );
}
