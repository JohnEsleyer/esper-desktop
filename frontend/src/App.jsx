import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Code2,
  Columns2,
  Copy,
  Edit2,
  Eye,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Maximize2,
  Minimize2,
  Moon,
  NotebookPen,
  PenTool,
  Play,
  Plus,
  PlusCircle,
  Search,
  Sliders,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  deleteNotebook,
  getCurrentWorkspace,
  listNotebooks,
  saveNotebook,
  selectWorkspaceFolder,
  setCurrentWorkspace,
} from "./lib/wailsBridge.js";
import CodeEditor from "./components/CodeEditor.jsx";
import MarkdownEditor from "./components/MarkdownEditor.jsx";
import ExcalidrawCanvas from "./components/ExcalidrawCanvas.jsx";
import Modal from "./components/Modal.jsx";

export const PREMADE_COVERS = [
  { id: "celestial", title: "Celestial Orbits", gradient: "from-indigo-950 via-slate-900 to-violet-950" },
  { id: "quantum", title: "Quantum Realm", gradient: "from-emerald-950 via-slate-900 to-teal-950" },
  { id: "solar", title: "Solar Dynamo", gradient: "from-amber-950 via-orange-950 to-stone-950" },
  { id: "midnight", title: "Midnight Velocity", gradient: "from-slate-950 via-blue-950 to-indigo-950" },
  { id: "nebula", title: "Cosmic Nebula", gradient: "from-purple-950 via-fuchsia-950 to-slate-950" },
  { id: "crimson", title: "Crimson Odyssey", gradient: "from-rose-950 via-red-950 to-slate-950" },
];

const DEFAULT_KEPLER_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#020617;overflow:hidden;font-family:sans-serif}
canvas{display:block}
.label{position:fixed;top:12px;left:12px;color:#818cf8;font-size:12px;font-family:monospace}
</style></head>
<body>
<div class="label">kepler-orbit &middot; local runtime active</div>
<canvas id="c"></canvas>
<script>
const c=document.getElementById('c'),x=c.getContext('2d');
function rs(){c.width=innerWidth;c.height=innerHeight}
addEventListener('resize',rs);rs();
let t=0;
function f(){
 x.fillStyle='#020617';x.fillRect(0,0,c.width,c.height);
 const cx=c.width/2,cy=c.height/2;
 x.fillStyle='#fbbf24';x.beginPath();x.arc(cx-30,cy,14,0,7);x.fill();
 x.strokeStyle='rgba(129,140,248,.25)';x.beginPath();x.ellipse(cx,cy,140,90,0,0,7);x.stroke();
 t+=0.02;
 const px=cx+140*Math.cos(t),py=cy+90*Math.sin(t);
 x.fillStyle='#818cf8';x.beginPath();x.arc(px,py,7,0,7);x.fill();
 x.strokeStyle='rgba(129,140,248,.4)';x.beginPath();x.moveTo(cx-30,cy);x.lineTo(px,py);x.stroke();
 requestAnimationFrame(f);
}f();
</script>
</body>
</html>`;

function extractFirstH1(markdown) {
  if (!markdown) return "";
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match) return "";
  return match[1].replace(/^[#\s*_-]+|[#\s*_-]+$/g, "").trim();
}

function updateOrPrependH1(markdown, newTitle) {
  const cleanTitle = newTitle.trim();
  if (!markdown) return `# ${cleanTitle}\n\n`;
  if (/^#\s+.+$/m.test(markdown)) {
    return markdown.replace(/^#\s+.+$/m, `# ${cleanTitle}`);
  }
  return `# ${cleanTitle}\n\n${markdown}`;
}

function toYouTubeEmbedUrl(url, start = null, end = null) {
  if (!url) return "";
  try {
    const trimmed = url.trim();
    let videoId = "";
    if (trimmed.includes("youtube.com/embed/")) {
      const parts = trimmed.split("youtube.com/embed/");
      videoId = parts[1]?.split("?")[0] || "";
    } else {
      const regExp = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
      const match = trimmed.match(regExp);
      if (match && match[1]) videoId = match[1];
    }
    if (!videoId) return trimmed;

    let embed = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
    if (start) embed += `&start=${start}`;
    if (end) embed += `&end=${end}`;
    return embed;
  } catch {
    return url;
  }
}

function computePageHierarchy(pages = []) {
  let rootCounter = 0;
  const childCounters = {};

  return pages.map((page) => {
    if (!page.parentId) {
      rootCounter++;
      childCounters[page.id] = 0;
      return {
        ...page,
        numbering: `${rootCounter}.`,
        isSubpage: false,
      };
    }

    const parentIndex = pages.findIndex((p) => p.id === page.parentId);
    let parentNum = "1";
    if (parentIndex !== -1) {
      const precedingRoots = pages.slice(0, parentIndex + 1).filter((p) => !p.parentId).length;
      parentNum = `${precedingRoots}`;
    }

    childCounters[page.parentId] = (childCounters[page.parentId] || 0) + 1;
    const subNum = childCounters[page.parentId];

    return {
      ...page,
      numbering: `${parentNum}.${subNum}`,
      isSubpage: true,
    };
  });
}

export default function App() {
  const [workspacePath, setWorkspacePath] = useState("");
  const [recentWorkspaces, setRecentWorkspaces] = useState([]);
  const [docList, setDocList] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState("all");
  const [customTags, setCustomTags] = useState(["Research", "Lectures", "Specs"]);

  // Workspace Splitter & View Modes
  const [splitPercent, setSplitPercent] = useState(50);
  const [isWideView, setIsWideView] = useState(false);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [visualViewMode, setVisualViewMode] = useState("preview");
  const [editorTheme, setEditorTheme] = useState("dark");

  // Buffers
  const [notesBuffer, setNotesBuffer] = useState("");
  const [canvasCodeBuffer, setCanvasCodeBuffer] = useState("");
  const [youtubeInputUrl, setYoutubeInputUrl] = useState("");
  const [youtubeStart, setYoutubeStart] = useState("");
  const [youtubeEnd, setYoutubeEnd] = useState("");
  const [showVideoSettings, setShowVideoSettings] = useState(false);

  // Outline Context Menu & Inline Renaming
  const [contextMenu, setContextMenu] = useState(null);
  const [editingPageId, setEditingPageId] = useState(null);
  const [editingTitleBuffer, setEditingTitleBuffer] = useState("");

  // Modals
  const [showAttachCanvasModal, setShowAttachCanvasModal] = useState(false);
  const [selectedCanvasType, setSelectedCanvasType] = useState("html");
  const [canvasScopeType, setCanvasScopeType] = useState("current");
  const [rangeFromIndex, setRangeFromIndex] = useState(0);
  const [rangeToIndex, setRangeToIndex] = useState(0);
  const [customCanvasTitle, setCustomCanvasTitle] = useState("");
  const [showFeatureModal, setShowFeatureModal] = useState(false);

  const [modalState, setModalState] = useState({
    isOpen: false,
    type: "alert",
    title: "",
    message: "",
    placeholder: "",
    initialValue: "",
    isDestructive: false,
    onConfirm: () => {},
  });

  const closeModal = () => setModalState((prev) => ({ ...prev, isOpen: false }));

  const iframeRef = useRef(null);
  const youtubeIframeRef = useRef(null);
  const workspaceContainerRef = useRef(null);

  // Workspace Discovery
  const refreshWorkspace = useCallback(async () => {
    const { current, recent } = await getCurrentWorkspace();
    setWorkspacePath(current || "");
    setRecentWorkspaces(recent || []);
    if (current) {
      const docs = await listNotebooks();
      setDocList(docs || []);
    } else {
      setDocList([]);
    }
  }, []);

  useEffect(() => {
    refreshWorkspace();
  }, [refreshWorkspace]);

  // Click outside closes context menus
  useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Divider dragging with requestAnimationFrame coalescing
  useEffect(() => {
    if (!isDraggingSplit) return;
    let rafId = null;

    const handlePointerMove = (e) => {
      if (rafId) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const container = workspaceContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const asideEl = container.querySelector("aside");
        const sidebarWidth = asideEl ? asideEl.offsetWidth : 256;
        const availableWidth = rect.width - sidebarWidth;
        if (availableWidth <= 0) return;
        const offsetX = clientX - rect.left - sidebarWidth;
        const percent = Math.min(Math.max((offsetX / availableWidth) * 100, 20), 80);
        setSplitPercent(percent);
      });
    };

    const handlePointerUp = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      setIsDraggingSplit(false);
    };

    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    window.addEventListener("touchmove", handlePointerMove, { passive: true });
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchend", handlePointerUp);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, [isDraggingSplit]);

  // Wide View ESC Hotkey
  useEffect(() => {
    if (!isWideView) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsWideView(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isWideView]);

  const handleChooseWorkspace = async () => {
    const chosen = await selectWorkspaceFolder();
    if (chosen) {
      await setCurrentWorkspace(chosen);
      await refreshWorkspace();
    }
  };

  const persistDoc = useCallback(async (doc) => {
    const updated = { ...doc, updatedAt: Date.now() };
    await saveNotebook(updated);
    setActiveDoc(updated);
    setDocList((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }, []);

  const hierarchyPages = useMemo(() => {
    return computePageHierarchy(activeDoc?.pages || []);
  }, [activeDoc?.pages]);

  const activePage = activeDoc?.pages?.[activePageIndex] || null;
  const attachedCanvas = activeDoc?.canvases?.find((c) =>
    c.assignedPages.includes(activePage?.id),
  );

  useEffect(() => {
    if (!activeDoc || !activePage) return;
    setNotesBuffer(activePage.notes || "");
    if (attachedCanvas?.type === "html") {
      setCanvasCodeBuffer(attachedCanvas.data?.code || "");
    }
    if (attachedCanvas?.type === "youtube") {
      setYoutubeInputUrl(attachedCanvas.data?.url || "");
      setYoutubeStart(attachedCanvas.data?.startTime || "");
      setYoutubeEnd(attachedCanvas.data?.endTime || "");
    }
  }, [activeDoc?.id, activePageIndex, attachedCanvas?.id]);

  const runVisual = useCallback(() => {
    if (iframeRef.current && attachedCanvas?.type === "html") {
      iframeRef.current.srcdoc = canvasCodeBuffer;
    }
  }, [canvasCodeBuffer, attachedCanvas]);

  const handleSeekVideo = useCallback((seconds) => {
    if (youtubeIframeRef.current?.contentWindow) {
      youtubeIframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
        "*",
      );
      youtubeIframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*",
      );
    }
  }, []);

  // Debounced persistence refs to avoid continuous disk I/O on keystroke
  const pendingNotesRef = useRef(null);
  const pendingCanvasCodeRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const activeDocRef = useRef(activeDoc);
  activeDocRef.current = activeDoc;
  const activePageIndexRef = useRef(activePageIndex);
  activePageIndexRef.current = activePageIndex;

  const flushPendingEdits = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const currentDoc = activeDocRef.current;
    if (!currentDoc) return;

    let hasChanges = false;
    let nextPages = currentDoc.pages;
    let nextCanvases = currentDoc.canvases;

    if (pendingNotesRef.current !== null) {
      const pageIdx = activePageIndexRef.current;
      if (nextPages[pageIdx]) {
        const newNotes = pendingNotesRef.current;
        const h1Title = extractFirstH1(newNotes);
        const title = h1Title || nextPages[pageIdx].title || "Untitled Chapter";
        nextPages = [...nextPages];
        nextPages[pageIdx] = { ...nextPages[pageIdx], notes: newNotes, title };
        hasChanges = true;
      }
      pendingNotesRef.current = null;
    }

    if (pendingCanvasCodeRef.current !== null) {
      const pageIdx = activePageIndexRef.current;
      const curPage = nextPages[pageIdx];
      const attached = nextCanvases.find((c) => c.assignedPages.includes(curPage?.id));
      if (attached && attached.type === "html") {
        const newCode = pendingCanvasCodeRef.current;
        nextCanvases = nextCanvases.map((c) =>
          c.id === attached.id ? { ...c, data: { ...c.data, code: newCode } } : c,
        );
        hasChanges = true;
      }
      pendingCanvasCodeRef.current = null;
    }

    if (hasChanges) {
      const updated = { ...currentDoc, pages: nextPages, canvases: nextCanvases, updatedAt: Date.now() };
      saveNotebook(updated);
      setActiveDoc(updated);
      setDocList((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    }
  }, []);

  // Flush before window unload / tab close
  useEffect(() => {
    const handleBeforeUnload = () => flushPendingEdits();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushPendingEdits();
    };
  }, [flushPendingEdits]);

  const handleNotesChange = useCallback((newNotes) => {
    setNotesBuffer(newNotes);
    pendingNotesRef.current = newNotes;
    const h1Title = extractFirstH1(newNotes);
    const curDoc = activeDocRef.current;
    const pageIdx = activePageIndexRef.current;
    const curPage = curDoc?.pages[pageIdx];
    const titleChanged = h1Title && curPage && h1Title !== curPage.title;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (titleChanged) {
      saveTimeoutRef.current = setTimeout(flushPendingEdits, 150);
    } else {
      saveTimeoutRef.current = setTimeout(flushPendingEdits, 350);
    }
  }, [flushPendingEdits]);

  const handleCanvasCodeChange = useCallback((newCode) => {
    setCanvasCodeBuffer(newCode);
    pendingCanvasCodeRef.current = newCode;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(flushPendingEdits, 350);
  }, [flushPendingEdits]);

  // Canvas Attachment
  const handleConfirmAttachCanvas = () => {
    if (!activeDoc) return;
    const targetPageIds = [];
    if (canvasScopeType === "current") {
      targetPageIds.push(activeDoc.pages[activePageIndex].id);
    } else {
      const start = Math.min(rangeFromIndex, rangeToIndex);
      const end = Math.max(rangeFromIndex, rangeToIndex);
      for (let i = start; i <= end; i++) targetPageIds.push(activeDoc.pages[i].id);
    }

    const defaultTitle =
      selectedCanvasType === "youtube"
        ? "YouTube Video Canvas"
        : selectedCanvasType === "html"
        ? "HTML Visual Canvas"
        : "Excalidraw Whiteboard";

    const newCanvas = {
      id: `c-${Date.now()}`,
      type: selectedCanvasType,
      title: customCanvasTitle.trim() || defaultTitle,
      assignedPages: targetPageIds,
      data: {
        code: selectedCanvasType === "html" ? DEFAULT_KEPLER_HTML : "",
        url: "",
        startTime: "",
        endTime: "",
        elements: selectedCanvasType === "excalidraw" ? [] : undefined,
      },
    };

    const updatedCanvases = activeDoc.canvases
      .map((c) => ({
        ...c,
        assignedPages: c.assignedPages.filter((pid) => !targetPageIds.includes(pid)),
      }))
      .filter((c) => c.assignedPages.length > 0);

    updatedCanvases.push(newCanvas);
    persistDoc({ ...activeDoc, canvases: updatedCanvases });
    setShowAttachCanvasModal(false);
  };

  const handleDetachCanvas = (canvasId) => {
    if (!activeDoc) return;
    setModalState({
      isOpen: true,
      type: "confirm",
      title: "Detach Canvas?",
      message: "This removes the canvas from the current chapter.",
      confirmText: "Detach",
      isDestructive: true,
      onConfirm: () => {
        closeModal();
        const activePid = activeDoc.pages[activePageIndex].id;
        const updatedCanvases = activeDoc.canvases
          .map((c) =>
            c.id === canvasId
              ? { ...c, assignedPages: c.assignedPages.filter((pid) => pid !== activePid) }
              : c,
          )
          .filter((c) => c.assignedPages.length > 0);
        persistDoc({ ...activeDoc, canvases: updatedCanvases });
      },
    });
  };

  const handleCreateBook = () => {
    setModalState({
      isOpen: true,
      type: "prompt",
      title: "Create Local Notebook",
      message: "Enter the title of the notebook:",
      placeholder: "e.g. Astrodynamics & Spaceflight",
      initialValue: "Untitled Notebook",
      confirmText: "Create Book",
      onConfirm: async (title) => {
        closeModal();
        if (!title || !title.trim()) return;
        const newDoc = {
          id: `doc-${Date.now()}`,
          title: title.trim(),
          description: "Local notebook saved directly on your disk.",
          tags: ["Research"],
          coverPreset: "celestial",
          pages: [
            {
              id: "p1",
              title: "Chapter 1",
              notes: `# ${title.trim()}\n\nStart writing notes here...`,
            },
          ],
          canvases: [],
        };
        await saveNotebook(newDoc);
        await refreshWorkspace();
        setActiveDoc(newDoc);
        setActivePageIndex(0);
      },
    });
  };

  const filteredDocList = useMemo(() => {
    return docList.filter((doc) => {
      const matchesSearch =
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesTag =
        selectedTagFilter === "all" || doc.tags?.includes(selectedTagFilter);
      return matchesSearch && matchesTag;
    });
  }, [docList, searchQuery, selectedTagFilter]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {isDraggingSplit && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}

      {/* UNIVERSAL HEADER */}
      <header className="h-12 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-2 text-indigo-400 font-bold">
            <BookOpen className="w-4 h-4 text-indigo-500" />
            <span className="text-white">Esper Desktop</span>
          </div>

          <span className="text-slate-700">/</span>

          <button
            onClick={handleChooseWorkspace}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 hover:border-indigo-500 text-slate-300 font-mono text-[11px] transition max-w-[280px] truncate"
            title="Click to change workspace folder"
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">{workspacePath || "Select Workspace Folder..."}</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {activeDoc ? (
            <>
              <button
                onClick={() => {
                  flushPendingEdits();
                  setActiveDoc(null);
                }}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded border border-slate-800 hover:bg-slate-800 transition"
              >
                Bookshelf
              </button>

              <button
                onClick={() => {
                  setSelectedCanvasType("html");
                  setCanvasScopeType("current");
                  setRangeFromIndex(activePageIndex);
                  setRangeToIndex(activePageIndex);
                  setShowAttachCanvasModal(true);
                }}
                className="text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 px-2.5 py-1 rounded transition inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Attach Canvas</span>
              </button>

              <button
                onClick={() => setIsWideView((w) => !w)}
                className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition"
              >
                {isWideView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span>{isWideView ? "Split" : "Wide"}</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleCreateBook}
              disabled={!workspacePath}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold transition shadow-sm flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Book</span>
            </button>
          )}
        </div>
      </header>

      {/* VIEWPORT */}
      {!workspacePath ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <HardDrive className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Select a Workspace Directory</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
              Esper stores notebooks directly on your filesystem as human-readable <code>.esper</code> JSON files.
            </p>
          </div>
          <button
            onClick={handleChooseWorkspace}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg transition active:scale-95"
          >
            Choose Folder on Disk
          </button>
        </div>
      ) : !activeDoc ? (
        /* BOOKSHELF DASHBOARD */
        <main className="flex-1 overflow-y-auto p-6 max-w-6xl w-full mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">
                Workspace Books ({filteredDocList.length})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search books..."
                  className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
            {filteredDocList.map((doc) => {
              const preset = PREMADE_COVERS.find((p) => p.id === doc.coverPreset) || PREMADE_COVERS[0];
              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    setActiveDoc(doc);
                    setActivePageIndex(0);
                  }}
                  className="group flex flex-col cursor-pointer"
                >
                  <div className={`w-full aspect-[1/1.4] rounded-xl border border-white/10 bg-gradient-to-br ${preset.gradient} p-4 flex flex-col justify-between shadow-md group-hover:-translate-y-1 transition duration-150 relative overflow-hidden`}>
                    <span className="text-[9px] font-mono text-white/70 bg-black/50 px-1 py-0.5 rounded self-start">
                      {doc.pages.length} ch
                    </span>
                    <div className="text-center my-auto px-1">
                      <h3 className="text-xs font-bold text-white line-clamp-2 drop-shadow">{doc.title}</h3>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[9px] font-mono text-white/60">
                      <span>{doc.tags?.[0] || "Research"}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalState({
                            isOpen: true,
                            type: "confirm",
                            title: `Delete "${doc.title}"?`,
                            message: "This permanently deletes the .esper file from disk.",
                            confirmText: "Delete",
                            isDestructive: true,
                            onConfirm: async () => {
                              closeModal();
                              await deleteNotebook(doc.id);
                              refreshWorkspace();
                            },
                          });
                        }}
                        className="text-slate-400 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <span className="text-xs text-slate-300 font-medium mt-1.5 truncate">{doc.title}</span>
                </div>
              );
            })}
          </div>

          {filteredDocList.length === 0 && (
            <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
              <BookOpen className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <h4 className="text-xs font-semibold text-slate-300">No notebooks found</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Click &ldquo;New Book&rdquo; to start your first notebook.</p>
            </div>
          )}
        </main>
      ) : (
        /* WORKSPACE VIEW */
        <main ref={workspaceContainerRef} className="flex-1 flex overflow-hidden relative">
          {/* CHAPTER OUTLINE */}
          <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
            <div className="h-10 px-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Chapters</span>
              <button
                onClick={() => {
                  const newPid = `p-${Date.now()}`;
                  const nextNum = activeDoc.pages.filter((p) => !p.parentId).length + 1;
                  const newPage = { id: newPid, title: `Chapter ${nextNum}`, notes: `# Chapter ${nextNum}\n\n` };
                  persistDoc({ ...activeDoc, pages: [...activeDoc.pages, newPage] });
                  setActivePageIndex(activeDoc.pages.length);
                }}
                className="hover:text-indigo-400 p-1"
                title="Add Chapter"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {hierarchyPages.map((p, idx) => {
                const canvas = activeDoc?.canvases?.find((c) => c.assignedPages.includes(p.id));
                const isSubpage = Boolean(p.isSubpage);

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      flushPendingEdits();
                      setActivePageIndex(idx);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: Math.min(e.clientX, window.innerWidth - 180),
                        y: Math.min(e.clientY, window.innerHeight - 200),
                        page: p,
                        index: idx,
                      });
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between ${
                      isSubpage ? "ml-4 border-l-2 border-indigo-900/50 pl-2" : ""
                    } ${
                      idx === activePageIndex
                        ? "bg-indigo-950 text-white font-semibold border border-indigo-800"
                        : "text-slate-400 hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-slate-500 font-mono text-[10px]">{p.numbering}</span>
                      <span className="truncate">{p.title || `Chapter ${idx + 1}`}</span>
                    </div>

                    {canvas && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-950 text-indigo-400 border border-indigo-900 shrink-0">
                        {canvas.type === "html" && <Code2 className="w-2.5 h-2.5 inline" />}
                        {canvas.type === "youtube" && <Video className="w-2.5 h-2.5 inline text-red-400" />}
                        {canvas.type === "excalidraw" && <PenTool className="w-2.5 h-2.5 inline text-amber-400" />}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* OUTLINE CONTEXT MENU */}
          {contextMenu && (
            <div
              style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
              className="fixed z-50 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg py-1 w-44 text-xs text-slate-200"
            >
              <button
                onClick={() => {
                  const newPid = `p-${Date.now()}`;
                  const parentIdx = contextMenu.index;
                  const newPage = { id: newPid, parentId: contextMenu.page.id, title: "Subchapter", notes: "# Subchapter\n\n" };
                  const nextPages = [...activeDoc.pages];
                  nextPages.splice(parentIdx + 1, 0, newPage);
                  persistDoc({ ...activeDoc, pages: nextPages });
                  setActivePageIndex(parentIdx + 1);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center gap-2"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Add Subchapter</span>
              </button>
              <button
                onClick={() => {
                  if (activeDoc.pages.length <= 1) return;
                  const delId = contextMenu.page.id;
                  const nextPages = activeDoc.pages.filter((_, i) => i !== contextMenu.index);
                  const updatedCanvases = activeDoc.canvases
                    .map((c) => ({
                      ...c,
                      assignedPages: c.assignedPages.filter((pid) => pid !== delId),
                    }))
                    .filter((c) => c.assignedPages.length > 0);
                  persistDoc({ ...activeDoc, pages: nextPages, canvases: updatedCanvases });
                  setActivePageIndex(0);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-rose-400 hover:bg-rose-600 hover:text-white flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Chapter</span>
              </button>
            </div>
          )}

          {/* CANVAS COMPANION PANE */}
          <section
            style={{
              width: !attachedCanvas ? "0%" : isWideView ? "100%" : `${splitPercent}%`,
              opacity: attachedCanvas ? 1 : 0,
              display: !attachedCanvas || isWideView ? "none" : "flex",
            }}
            className={`flex-col bg-slate-950 border-r border-slate-800 relative min-w-0 ${
              isDraggingSplit ? "transition-none select-none pointer-events-none" : "transition-[width] duration-150"
            }`}
          >
            {/* Canvas Sub-Header */}
            {attachedCanvas && (
              <>
                <div className="h-10 bg-slate-900/90 border-b border-slate-800 px-3 flex items-center justify-between shrink-0">
                  <span className="text-xs font-mono text-indigo-400 truncate font-semibold uppercase text-[10px]">
                    {attachedCanvas.type === "youtube" ? "YouTube Video" : attachedCanvas.type} Canvas &middot; {attachedCanvas.title}
                  </span>

                  <div className="flex items-center space-x-1.5">
                    {attachedCanvas.type === "html" && (
                      <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px]">
                        <button
                          onClick={() => setVisualViewMode("preview")}
                          className={`px-2 py-0.5 rounded ${visualViewMode === "preview" ? "text-indigo-400 bg-indigo-950 font-medium" : "text-slate-400"}`}
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => setVisualViewMode("split")}
                          className={`px-2 py-0.5 rounded ${visualViewMode === "split" ? "text-indigo-400 bg-indigo-950 font-medium" : "text-slate-400"}`}
                        >
                          Split
                        </button>
                        <button
                          onClick={() => setVisualViewMode("code")}
                          className={`px-2 py-0.5 rounded ${visualViewMode === "code" ? "text-indigo-400 bg-indigo-950 font-medium" : "text-slate-400"}`}
                        >
                          Code
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => handleDetachCanvas(attachedCanvas.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                      title="Detach Canvas"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Canvas Body */}
                <div className="flex-1 flex overflow-hidden relative">
                  {attachedCanvas.type === "html" && (
                    <>
                      {(visualViewMode === "code" || visualViewMode === "split") && (
                        <div className={`${visualViewMode === "split" ? "w-1/2" : "w-full"} flex flex-col border-r border-slate-800 bg-[#060911]`}>
                          <div className="h-7 bg-slate-900/60 px-3 flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/80">
                            <span>HTML Source</span>
                            <button onClick={runVisual} className="text-indigo-400 hover:text-indigo-300 font-semibold text-[11px]">
                              Run (Ctrl+Enter)
                            </button>
                          </div>
                          <CodeEditor
                            value={canvasCodeBuffer}
                            onChange={handleCanvasCodeChange}
                            onRun={runVisual}
                          />
                        </div>
                      )}
                      {(visualViewMode === "preview" || visualViewMode === "split") && (
                        <div className={`${visualViewMode === "split" ? "w-1/2" : "w-full"} flex-1 relative bg-black`}>
                          <iframe
                            ref={iframeRef}
                            title="HTML Runtime"
                            className={`w-full h-full border-none ${isDraggingSplit ? "pointer-events-none" : ""}`}
                            style={{ willChange: "transform" }}
                            sandbox="allow-scripts allow-same-origin"
                            srcDoc={canvasCodeBuffer || attachedCanvas.data?.code || ""}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {attachedCanvas.type === "youtube" && (
                    <div className="w-full h-full flex flex-col bg-slate-950">
                      {attachedCanvas.data?.url ? (
                        <iframe
                          ref={youtubeIframeRef}
                          src={toYouTubeEmbedUrl(attachedCanvas.data.url, attachedCanvas.data.startTime, attachedCanvas.data.endTime)}
                          title="YouTube Player"
                          className={`w-full flex-1 border-none ${isDraggingSplit ? "pointer-events-none" : ""}`}
                          style={{ willChange: "transform" }}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                          <Video className="w-8 h-8 text-red-500 mb-2" />
                          <h4 className="text-xs font-semibold text-white">Attach YouTube URL</h4>
                          <div className="flex items-center gap-2 mt-3 max-w-sm w-full">
                            <input
                              type="text"
                              placeholder="https://www.youtube.com/watch?v=..."
                              value={youtubeInputUrl}
                              onChange={(e) => setYoutubeInputUrl(e.target.value)}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-red-500"
                            />
                            <button
                              onClick={() => {
                                const canvases = activeDoc.canvases.map((c) =>
                                  c.id === attachedCanvas.id ? { ...c, data: { ...c.data, url: youtubeInputUrl } } : c,
                                );
                                persistDoc({ ...activeDoc, canvases });
                              }}
                              className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1.5 rounded font-semibold"
                            >
                              Load
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {attachedCanvas.type === "excalidraw" && (
                    <ExcalidrawCanvas
                      initialData={attachedCanvas.data}
                      onChange={(data) => {
                        const canvases = activeDoc.canvases.map((can) =>
                          can.id === attachedCanvas.id ? { ...can, data: { ...can.data, ...data } } : can,
                        );
                        persistDoc({ ...activeDoc, canvases });
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </section>

          {/* SLIDING RESIZER DIVIDER */}
          {attachedCanvas && !isWideView && (
            <div
              role="separator"
              onMouseDown={() => setIsDraggingSplit(true)}
              onTouchStart={() => setIsDraggingSplit(true)}
              onDoubleClick={() => setSplitPercent(50)}
              title="Drag to resize · Double-click to center"
              className={`w-1.5 z-20 cursor-col-resize flex items-center justify-center shrink-0 transition-colors ${
                isDraggingSplit ? "bg-indigo-600" : "bg-slate-800 hover:bg-indigo-500"
              }`}
            >
              <div className="w-0.5 h-6 bg-slate-600 rounded" />
            </div>
          )}

          {/* NOTES EDITOR PANE */}
          {!isWideView && (
            <section
              className="flex-1 flex flex-col bg-slate-950 p-6 overflow-y-auto min-w-0"
            >
              <MarkdownEditor
                value={notesBuffer}
                theme={editorTheme}
                onChange={handleNotesChange}
                onTimestampClick={handleSeekVideo}
                enableTimestamps={attachedCanvas?.type === "youtube"}
                onToggleTheme={() => setEditorTheme((t) => (t === "dark" ? "light" : "dark"))}
              />
            </section>
          )}
        </main>
      )}

      {/* ATTACH CANVAS MODAL */}
      {showAttachCanvasModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-indigo-400" /> Attach Canvas
              </h3>
              <button onClick={() => setShowAttachCanvasModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setSelectedCanvasType("html")}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                  selectedCanvasType === "html" ? "border-indigo-500 bg-indigo-950/60 ring-1 ring-indigo-500" : "border-slate-800 bg-slate-950"
                }`}
              >
                <Code2 className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold text-white">HTML</span>
                <span className="text-[10px] text-slate-400">Simulation</span>
              </button>
              <button
                onClick={() => setSelectedCanvasType("youtube")}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                  selectedCanvasType === "youtube" ? "border-red-500 bg-red-950/60 ring-1 ring-red-500" : "border-slate-800 bg-slate-950"
                }`}
              >
                <Video className="w-4 h-4 text-red-500" />
                <span className="text-xs font-semibold text-white">Video</span>
                <span className="text-[10px] text-slate-400">Timestamps</span>
              </button>
              <button
                onClick={() => setSelectedCanvasType("excalidraw")}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                  selectedCanvasType === "excalidraw" ? "border-amber-500 bg-amber-950/60 ring-1 ring-amber-500" : "border-slate-800 bg-slate-950"
                }`}
              >
                <PenTool className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-white">Whiteboard</span>
                <span className="text-[10px] text-slate-400">Diagrams</span>
              </button>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Canvas Title</label>
              <input
                type="text"
                placeholder="e.g. Orbit Simulation"
                value={customCanvasTitle}
                onChange={(e) => setCustomCanvasTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowAttachCanvasModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAttachCanvas}
                className="px-4 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
              >
                Attach
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DIALOG MODAL */}
      <Modal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        placeholder={modalState.placeholder}
        initialValue={modalState.initialValue}
        confirmText={modalState.confirmText}
        isDestructive={modalState.isDestructive}
        onClose={closeModal}
        onConfirm={modalState.onConfirm}
      />
    </div>
  );
}
