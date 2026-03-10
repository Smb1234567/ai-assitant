const { embed } = require("../ollama");

const DEFAULT_EMBED_MODEL =
  process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

async function createEmbeddings(input, model = DEFAULT_EMBED_MODEL) {
  const items = Array.isArray(input) ? input : [input];
  const embeddings = await embed({
    model,
    input: items,
  });

  if (!Array.isArray(embeddings) || embeddings.length !== items.length) {
    throw new Error("Embedding response shape was not valid.");
  }

  return embeddings;
}

async function createSingleEmbedding(input, model = DEFAULT_EMBED_MODEL) {
  const [embedding] = await createEmbeddings([input], model);
  return embedding;
}

module.exports = {
  DEFAULT_EMBED_MODEL,
  createEmbeddings,
  createSingleEmbedding,
};
