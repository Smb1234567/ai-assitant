export default function Upload({ documents, uploadState, onUploadFile }) {
  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      onUploadFile(file);
      event.target.value = "";
    }
  }

  return (
    <section className="rounded-[28px] border border-dashed border-sand-300 bg-white/70 p-5 shadow-panel backdrop-blur">
      <div>
        <p className="font-display text-lg text-sand-900">Document Workspace</p>
        <p className="mt-1 text-sm text-sand-700">
          Upload PDF, DOCX, or TXT files and query them through chat.
        </p>
      </div>

      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-sand-300 bg-sand-100 px-4 py-6 text-center text-sm text-sand-700 transition hover:border-ember-500">
        <span className="font-medium text-sand-900">
          {uploadState.isUploading ? "Indexing document..." : "Choose a document"}
        </span>
        <span className="mt-1 text-xs">
          Files are chunked, embedded, and stored locally in LanceDB.
        </span>
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md"
          disabled={uploadState.isUploading}
          onChange={handleFileChange}
          className="hidden"
        />
      </label>

      {uploadState.status ? (
        <div className="mt-4 rounded-2xl bg-moss-400/10 px-4 py-3 text-sm text-sand-900">
          {uploadState.status}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-sand-900">Indexed documents</p>
          <span className="rounded-full bg-sand-100 px-3 py-1 text-xs font-medium text-sand-700">
            {documents.length}
          </span>
        </div>

        {documents.length ? (
          documents.map((document) => (
            <div
              key={document.docId}
              className="rounded-2xl border border-sand-300 bg-white px-4 py-3 text-sm text-sand-700"
            >
              <p className="font-medium text-sand-900">{document.fileName}</p>
              <p className="mt-1 text-xs">
                {document.chunkCount} chunks • {document.embeddingModel}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-sand-100 px-4 py-4 text-sm text-sand-700">
            No indexed documents yet.
          </div>
        )}
      </div>
    </section>
  );
}
