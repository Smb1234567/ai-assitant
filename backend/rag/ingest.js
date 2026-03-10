const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

const { createEmbeddings, DEFAULT_EMBED_MODEL } = require("./embeddings");
const { getOrCreateDocumentTable, upsertDocumentMetadata } = require("./store");

const DEFAULT_CHUNK_WORDS = Number(process.env.RAG_CHUNK_WORDS || 350);
const DEFAULT_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 70);

async function extractTextFromFile(file) {
  const extension = path.extname(file.originalname || file.filename).toLowerCase();

  if (extension === ".pdf") {
    const buffer = await fs.readFile(file.path);
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }

  if (extension === ".docx") {
    const parsed = await mammoth.extractRawText({ path: file.path });
    return parsed.value;
  }

  if (extension === ".txt" || extension === ".md") {
    return fs.readFile(file.path, "utf8");
  }

  throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
}

function normalizeWhitespace(text) {
  return text.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function chunkText(
  text,
  chunkWords = DEFAULT_CHUNK_WORDS,
  overlapWords = DEFAULT_CHUNK_OVERLAP
) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];

  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkWords, words.length);
    const chunk = words.slice(start, end).join(" ").trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end >= words.length) {
      break;
    }
    start = Math.max(end - overlapWords, start + 1);
  }

  return chunks;
}

async function ingestDocument(file) {
  const normalizedText = normalizeWhitespace(await extractTextFromFile(file));
  if (!normalizedText) {
    throw new Error("The uploaded file did not contain extractable text.");
  }

  const chunks = chunkText(normalizedText);
  if (!chunks.length) {
    throw new Error("The uploaded file could not be chunked.");
  }

  const vectors = await createEmbeddings(chunks);
  const docId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const records = chunks.map((chunk, index) => ({
    id: `${docId}:${index}`,
    docId,
    fileName: file.originalname,
    mimeType: file.mimetype,
    chunkIndex: index,
    text: chunk,
    vector: vectors[index],
    createdAt,
  }));

  const { table, created } = await getOrCreateDocumentTable(records);
  if (!created) {
    await table.add(records);
  }

  const documentRecord = {
    docId,
    fileName: file.originalname,
    mimeType: file.mimetype,
    chunkCount: chunks.length,
    characterCount: normalizedText.length,
    embeddingModel: DEFAULT_EMBED_MODEL,
    createdAt,
  };

  await upsertDocumentMetadata(documentRecord);
  return documentRecord;
}

module.exports = {
  chunkText,
  ingestDocument,
};
