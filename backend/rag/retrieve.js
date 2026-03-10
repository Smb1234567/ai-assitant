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
  searchResults = [],
  think,
  temperature,
}) {
  const enrichedMessages = [...messages];
  const contextBlocks = [];

  if (searchResults.length) {
    contextBlocks.push(
      `Context from web search:\n${searchResults
        .map(
          (result, index) =>
            `${index + 1}. ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet}`
        )
        .join("\n\n")}`
    );
  }

  contextBlocks.push(
    `Context from uploaded documents:\n${buildDocumentContext(retrievals)}`
  );

  enrichedMessages.splice(enrichedMessages.length - 1, 0, {
    role: "system",
    content: `${contextBlocks.join(
      "\n\n"
    )}\n\nUse the provided context. Prefer web search context for current events and document context for uploaded material. If the answer is not present, say so clearly.`,
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
