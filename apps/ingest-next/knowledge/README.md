# Knowledge base (local file system)

This folder is the **local knowledge base** for Chat TPG. The chat agent can list, read, and search these files to answer questions.

## How to populate

- Add **Markdown** (`.md`) or **plain text** (`.txt`) files.
- Use subfolders to organize by topic (e.g. `docs/`, `policies/`).
- The agent uses the tools `list_files`, `read_file`, and `search_in_files` over this directory only.

## Relationship to the Vercel Knowledge Agent Template

In the [Vercel Knowledge Agent Template](https://github.com/vercel-labs/knowledge-agent-template):

1. **Sources** (GitHub repos, YouTube transcripts, custom APIs) are configured in the admin UI.
2. A **sync workflow** (Vercel Workflow) aggregates content into a **snapshot repository**.
3. At runtime, a **Vercel Sandbox** is created with that repo cloned; the agent runs **bash** (e.g. `grep`, `find`, `cat`) inside the sandbox to search and read files.

In Chat TPG (local run):

- This **`knowledge/`** folder plays the role of that file system.
- There is no sandbox; the API route runs **Node.js** tools that list/read/search only under `knowledge/`.
- You can copy or sync content here from your own sources (e.g. clone a repo into `knowledge/`, or add exported docs).

No embeddings or vector DB are required; the model uses the tools to fetch relevant content when answering.
