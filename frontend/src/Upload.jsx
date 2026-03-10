export default function Upload() {
  return (
    <section className="rounded-[28px] border border-dashed border-sand-300 bg-white/70 p-5 shadow-panel backdrop-blur">
      <div>
        <p className="font-display text-lg text-sand-900">Document Workspace</p>
        <p className="mt-1 text-sm text-sand-700">
          PDF, DOCX, and TXT ingestion will connect here in the next step.
        </p>
      </div>
      <div className="mt-4 rounded-[24px] bg-sand-100 px-4 py-5 text-sm text-sand-700">
        Upload and RAG endpoints are stubbed server-side right now. The UI placeholder
        is kept in place so the document flow can be added without reshaping the app.
      </div>
    </section>
  );
}
