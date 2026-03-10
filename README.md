# AI Desktop Assistant

Linux desktop AI assistant built with Electron, React, Express, and Ollama. The app is structured to support:

- dynamic Ollama model discovery via `/api/tags`
- model pulling via `/api/pull`
- streaming chat via `/api/chat`
- provider-backed web search augmentation
- document upload and local RAG with LanceDB
- a future runtime switch between Ollama and WebGPU

## Technical Context Used

The initial project shape follows these references:

- Ollama API docs: https://docs.ollama.com/api
- Electron process model and preload guidance: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron security guidance: https://www.electronjs.org/docs/latest/tutorial/security
- LanceDB JavaScript docs: https://www.lancedb.com/docs/

These sources drove two key constraints:

1. The desktop shell should keep Node access in the main/preload processes and expose a narrow bridge to the renderer.
2. Model management must be dynamic and query Ollama at runtime instead of hardcoding model names.

## Project Setup

### 1. Prerequisites

Install the following on your Linux machine:

- Node.js `20.10+`
- npm `10+`
- Ollama

Confirm Ollama is installed and the daemon is available:

```bash
ollama --version
curl http://localhost:11434/api/tags
```

If Ollama is not running, start it:

```bash
ollama serve
```

### 2. Install dependencies

From the project root:

```bash
cd /home/igris/ai-desktop-assistant
npm install
```

### 2.1 Optional real search provider configuration

The app supports real search-provider APIs when you set one of these environment variables:

- `BRAVE_SEARCH_API_KEY`
- `TAVILY_API_KEY`
- `SERPAPI_API_KEY`

If none are set, the app falls back to DuckDuckGo HTML/Lite parsing.

Example:

```bash
export BRAVE_SEARCH_API_KEY="your_key_here"
```

Brave is the recommended first option because it provides a direct web search API without requiring browser scraping.

### 3. Development mode

This project is set up to run three processes together:

- Express backend on port `3001`
- Vite frontend on port `5173`
- Electron shell after both ports are ready

Start the app with:

```bash
npm run dev
```

### 4. Production-style local run

Build the renderer:

```bash
npm run build
```

Then launch Electron:

```bash
npm run start
```

### 5. Expected directory layout

The next implementation steps will fill this structure:

```text
ai-desktop-assistant/
├── backend/
│   ├── rag/
│   ├── models.js
│   ├── ollama.js
│   ├── search.js
│   └── server.js
├── frontend/
│   └── src/
├── main/
│   ├── electron-main.js
│   └── preload.js
├── vector_db/
├── package.json
└── README.md
```

## Notes For The Next File Generation Step

The next files to generate should be:

1. `main/electron-main.js`
2. `main/preload.js`
3. `backend/ollama.js`
4. `backend/models.js`
5. `backend/server.js`

Those files will establish:

- secure Electron bootstrapping
- dynamic installed-model loading
- pull-model support
- streaming chat transport
- shared backend contracts for the React UI
