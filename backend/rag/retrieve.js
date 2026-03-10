const { chat } = require("../ollama");
const { createSingleEmbedding } = require("./embeddings");
const { getOrCreateDocumentTable, readDocumentMetadata } = require("./store");

const DEFAULT_RETRIEVAL_LIMIT = Number(process.env.RAG_TOP_K || 3);

async function getIndexedDocuments() {
  return readDocumentMetadata();
}

async function retrieveRelevantChunks(question, limit = DEFAULT_RETRIEVAL_LIMIT) {
  const queryVector = await createSingleEmbedding(question);
  const { table } = await getOrCreateDocumentTable();
  const results = await table.search(queryVector).limit(limit).toArray();

  return results.map((result) => ({
    docId: result.docId,
    fileName: result.fileName,
    chunkIndex: result.chunkIndex,
    text: result.text,
    distance: result._distance,
  }));
}

function buildDocumentContext(chunks) {
  return chunks
    .map(
      (chunk, index) =>
        `Chunk ${index + 1} from ${chunk.fileName} (section ${chunk.chunkIndex}):\n${chunk.text}`
    )
    .join("\n\n");
}

async function streamDocumentAnswer({
  model,
  messages,
  retrievals,
  think,
  temperature,
}) {
  const enrichedMessages = [...messages];
  enrichedMessages.splice(enrichedMessages.length - 1, 0, {
    role: "system",
    content: `Context from uploaded documents:\n${buildDocumentContext(
      retrievals
    )}\n\nAnswer using the provided document context. If the answer is not present, say so clearly.`,
  });

  return chat({
    model,
    messages: enrichedMessages,
    stream: true,
    think,
    options: {
      temperature: typeof temperature === "number" ? temperature : 0.3,
    },
  });
}

module.exports = {
  getIndexedDocuments,
  retrieveRelevantChunks,
  streamDocumentAnswer,
};
