const fs = require("fs/promises");
const path = require("path");
const lancedb = require("@lancedb/lancedb");

const VECTOR_DB_DIR = path.resolve(__dirname, "../../vector_db");
const DOCUMENT_TABLE_NAME = "document_chunks";
const DOCUMENT_METADATA_PATH = path.join(VECTOR_DB_DIR, "documents.json");

async function ensureVectorDbDir() {
  await fs.mkdir(VECTOR_DB_DIR, { recursive: true });
}

async function getConnection() {
  await ensureVectorDbDir();
  return lancedb.connect(VECTOR_DB_DIR);
}

async function getOrCreateDocumentTable(records = []) {
  const db = await getConnection();
  const tableNames = await db.tableNames();

  if (tableNames.includes(DOCUMENT_TABLE_NAME)) {
    return {
      table: await db.openTable(DOCUMENT_TABLE_NAME),
      created: false,
    };
  }

  if (!records.length) {
    throw new Error("No document table exists yet.");
  }

  return {
    table: await db.createTable(DOCUMENT_TABLE_NAME, records, {
      mode: "create",
      existOk: true,
    }),
    created: true,
  };
}

async function readDocumentMetadata() {
  await ensureVectorDbDir();

  try {
    const raw = await fs.readFile(DOCUMENT_METADATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function upsertDocumentMetadata(documentRecord) {
  const documents = await readDocumentMetadata();
  const existingIndex = documents.findIndex(
    (item) => item.docId === documentRecord.docId
  );

  if (existingIndex >= 0) {
    documents[existingIndex] = documentRecord;
  } else {
    documents.unshift(documentRecord);
  }

  await fs.writeFile(
    DOCUMENT_METADATA_PATH,
    JSON.stringify(documents, null, 2),
    "utf8"
  );
}

async function removeDocumentMetadata(docId) {
  const documents = await readDocumentMetadata();
  const filtered = documents.filter((item) => item.docId !== docId);
  await fs.writeFile(
    DOCUMENT_METADATA_PATH,
    JSON.stringify(filtered, null, 2),
    "utf8"
  );
}

async function clearDocumentMetadata() {
  await fs.writeFile(DOCUMENT_METADATA_PATH, JSON.stringify([], null, 2), "utf8");
}

module.exports = {
  VECTOR_DB_DIR,
  DOCUMENT_TABLE_NAME,
  clearDocumentMetadata,
  getConnection,
  getOrCreateDocumentTable,
  readDocumentMetadata,
  removeDocumentMetadata,
  upsertDocumentMetadata,
};
