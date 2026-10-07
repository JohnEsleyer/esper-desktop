# Esper Desktop

Esper Desktop is a native desktop workspace application for managing local notebooks and knowledge documents. Powered by **Wails v2**, **Go**, and a modern **React + Lexical** frontend.

## ✨ Features

- **Local-First & Offline**: Notes and workspaces reside directly on your local filesystem with no mandatory cloud sync.
- **Custom Notebook File Format**: Transparent JSON document storage using `.esper` files.
- **Rich-Text & Markdown Editing**: Built on Meta's Lexical engine with Markdown support and formatting toolbar.
- **Workspace Switching**: Easily select, open, and remember recent workspace directories across sessions.
- **Lightweight Native Desktop Shell**: Built using [Wails v2](https://wails.io/) providing minimal memory footprint compared to traditional Electron apps.

## 🛠 Tech Stack

- **Desktop Framework**: [Wails v2](https://wails.io/)
- **Backend / OS Integration**: Go (Golang)
- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons
- **Rich Editor**: Meta Lexical (`lexical`, `@lexical/react`, `@lexical/markdown`)
- **Package Manager**: [Bun](https://bun.sh/)

---

## 🚀 Getting Started

### Prerequisites

1. **Go** (1.20+ recommended): [Install Go](https://golang.org/dl/)
2. **Wails CLI v2**:
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```
3. **Bun**: [Install Bun](https://bun.sh/)
4. System dependencies for Wails (e.g., `libgtk-3-dev` and `libwebkit2gtk-4.0-dev` on Linux). See [Wails Linux Requirements](https://wails.io/docs/gettingstarted/installation#linux-prerequisites).

### Development Mode

Run the live-reloading development environment:

```bash
# In the esper-desktop root directory
wails dev
```

The frontend will run via Vite watcher and reload on changes while Wails recompiles Go backend changes automatically.

### Building for Production

Compile a production binary:

```bash
wails build
```

The packaged executable will be available inside `build/bin/`.

---

## 📂 Project Structure

```
esper-desktop/
├── app.go             # Application state, file I/O, workspace config & bindings
├── main.go            # Wails application entrypoint and window setup
├── wails.json         # Wails project configuration
├── build/             # Application icons and compiled output binaries
└── frontend/          # React + Vite frontend
    ├── src/
    │   ├── components/# Workspace selector, sidebar, notebook editor
    │   ├── App.jsx    # Main desktop application interface
    │   └── main.jsx   # UI root mounting
    ├── package.json
    └── vite.config.js
```

---

## 📄 License

[MIT](LICENSE)
