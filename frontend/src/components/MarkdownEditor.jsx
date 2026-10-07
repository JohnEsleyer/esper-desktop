import { memo, useCallback, useEffect, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  HeadingNode,
  QuoteNode,
} from "@lexical/rich-text";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $createCodeNode, $isCodeNode, CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import {
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from "@lexical/react/LexicalHorizontalRuleNode";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { $getNearestNodeOfType } from "@lexical/utils";
import { $setBlocksType } from "@lexical/selection";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Moon,
  Quote,
  Redo,
  Strikethrough,
  Sun,
  Terminal,
  Undo,
} from "lucide-react";

const TIMESTAMP_PATTERN = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

function parseTimestampToSeconds(text) {
  const match = text.match(/\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?/);
  if (!match) return null;
  if (match[3] !== undefined) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  return minutes * 60 + seconds;
}

// ---------------------------------------------------------------------------
// Lexical Markdown Sync Plugin
// Handles non-blocking keystrokes (0ms delay) and safe serialization
// ---------------------------------------------------------------------------
function MarkdownSyncPlugin({ value, onChange, onStatsChange }) {
  const [editor] = useLexicalComposerContext();
  const lastEmittedMdRef = useRef(value || "");
  const debounceTimerRef = useRef(null);
  const isSettingContentRef = useRef(false);

  const flushMarkdown = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    editor.getEditorState().read(() => {
      const md = $convertToMarkdownString(TRANSFORMERS);
      lastEmittedMdRef.current = md;
      onChange(md);

      const text = $getRoot().getTextContent();
      onStatsChange({
        wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
        charCount: text.length,
      });
    });
  }, [editor, onChange, onStatsChange]);

  // Load external content when switching chapters
  useEffect(() => {
    if (value === lastEmittedMdRef.current) return;
    lastEmittedMdRef.current = value || "";
    isSettingContentRef.current = true;
    editor.update(() => {
      $convertFromMarkdownString(value || "", TRANSFORMERS);
    });
    editor.getEditorState().read(() => {
      const text = $getRoot().getTextContent();
      onStatsChange({
        wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
        charCount: text.length,
      });
    });
    isSettingContentRef.current = false;
  }, [value, editor, onStatsChange]);

  // Capture typed changes without blocking main thread
  useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (isSettingContentRef.current) return;
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(flushMarkdown, 250);
    });
  }, [editor, flushMarkdown]);

  // Flush on unmount, blur, or Ctrl+S
  useEffect(() => {
    const handleBeforeUnload = () => flushMarkdown();
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        flushMarkdown();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("keydown", handleKeyDown);
      flushMarkdown();
    };
  }, [flushMarkdown]);

  return null;
}

// ---------------------------------------------------------------------------
// Lexical Toolbar (Updates marks ONLY on selection change, NOT typing)
// ---------------------------------------------------------------------------
function LexicalToolbar({ theme, onToggleTheme }) {
  const [editor] = useLexicalComposerContext();
  const [blockType, setBlockType] = useState("paragraph");
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isStrike, setIsStrike] = useState(false);
  const [isCode, setIsCode] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    setIsBold(selection.hasFormat("bold"));
    setIsItalic(selection.hasFormat("italic"));
    setIsStrike(selection.hasFormat("strikethrough"));
    setIsCode(selection.hasFormat("code"));

    const anchorNode = selection.anchor.getNode();
    const element =
      anchorNode.getKey() === "root"
        ? anchorNode
        : anchorNode.getTopLevelElementOrThrow();

    if ($isHeadingNode(element)) {
      setBlockType(element.getTag());
    } else if ($isListNode(element)) {
      const parentList = $getNearestNodeOfType(anchorNode, ListNode);
      setBlockType(parentList ? parentList.getListType() : element.getListType());
    } else if (element.getType() === "quote") {
      setBlockType("quote");
    } else if ($isCodeNode(element)) {
      setBlockType("code");
    } else {
      setBlockType("paragraph");
    }
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, updateToolbar]);

  const toggleHeading = (level) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === level) {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createHeadingNode(level));
        }
      }
    });
  };

  const toggleQuote = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === "quote") {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      }
    });
  };

  const toggleCodeBlock = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === "code") {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createCodeNode());
        }
      }
    });
  };

  const toggleBulletList = () => {
    if (blockType !== "bullet") {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

  const toggleNumberedList = () => {
    if (blockType !== "number") {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

  const isDark = theme === "dark";

  return (
    <div
      className={`h-10 px-3 flex items-center justify-between shrink-0 select-none gap-2 border-b transition-colors ${
        isDark
          ? "bg-slate-950/80 border-slate-800 text-slate-400"
          : "bg-slate-50 border-slate-200 text-slate-600"
      }`}
    >
      <div className="flex items-center space-x-0.5 overflow-x-auto py-1">
        <button
          type="button"
          onClick={() => toggleHeading("h1")}
          className={`p-1.5 rounded transition-colors ${
            blockType === "h1"
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Heading 1"
        >
          <Heading1 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => toggleHeading("h2")}
          className={`p-1.5 rounded transition-colors ${
            blockType === "h2"
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Heading 2"
        >
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => toggleHeading("h3")}
          className={`p-1.5 rounded transition-colors ${
            blockType === "h3"
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Heading 3"
        >
          <Heading3 className="w-3.5 h-3.5" />
        </button>

        <span className={`w-px h-4 mx-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />

        <button
          type="button"
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
          className={`p-1.5 rounded transition-colors ${
            isBold
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
          className={`p-1.5 rounded transition-colors ${
            isItalic
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")}
          className={`p-1.5 rounded transition-colors ${
            isStrike
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
                ? "text-slate-400 hover:text-white hover:bg-slate-800"
                : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Strikethrough"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
          className={`p-1.5 rounded transition-colors ${
            isCode
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Inline Code"
        >
          <Code className="w-3.5 h-3.5" />
        </button>

        <span className={`w-px h-4 mx-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />

        <button
          type="button"
          onClick={toggleBulletList}
          className={`p-1.5 rounded transition-colors ${
            blockType === "bullet"
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Bullet List"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleNumberedList}
          className={`p-1.5 rounded transition-colors ${
            blockType === "number"
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Numbered List"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleQuote}
          className={`p-1.5 rounded transition-colors ${
            blockType === "quote"
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Quote"
        >
          <Quote className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleCodeBlock}
          className={`p-1.5 rounded transition-colors ${
            blockType === "code"
              ? isDark
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : "bg-indigo-100 text-indigo-700"
              : isDark
              ? "text-slate-400 hover:text-white hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Code Block"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
          className={`p-1.5 rounded transition-colors ${
            isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Horizontal Divider"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <span className={`w-px h-4 mx-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />

        <button
          type="button"
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          className={`p-1.5 rounded transition-colors ${
            isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Undo (Ctrl+Z)"
        >
          <Undo className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          className={`p-1.5 rounded transition-colors ${
            isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:bg-slate-200"
          }`}
          title="Redo (Ctrl+Y)"
        >
          <Redo className="w-3.5 h-3.5" />
        </button>
      </div>

      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          className={`p-1.5 rounded-lg border transition-colors inline-flex items-center gap-1 text-xs shrink-0 ${
            isDark
              ? "bg-slate-900 border-slate-700 text-amber-300 hover:text-amber-200 hover:bg-slate-800"
              : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
          }`}
          title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root MarkdownEditor Component (Meta Lexical Engine)
// ---------------------------------------------------------------------------
function MarkdownEditor({
  value,
  onChange,
  onTimestampClick,
  enableTimestamps = false,
  theme = "dark",
  onToggleTheme,
}) {
  const isDark = theme === "dark";
  const [stats, setStats] = useState(() => {
    const text = value || "";
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { wordCount: words, charCount: text.length };
  });

  const editorConfig = {
    namespace: "EsperLexicalNotes",
    theme: {
      paragraph: "editor-p",
      heading: {
        h1: "editor-h1",
        h2: "editor-h2",
        h3: "editor-h3",
      },
      list: {
        ul: "editor-ul",
        ol: "editor-ol",
        listitem: "editor-li",
      },
      quote: "editor-quote",
      code: "editor-code-block",
      text: {
        bold: "font-bold",
        italic: "italic",
        strikethrough: "line-through",
        code: "editor-inline-code",
      },
      hr: "editor-hr",
      link: "text-indigo-400 underline hover:text-indigo-300 cursor-pointer",
    },
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      HorizontalRuleNode,
      LinkNode,
      AutoLinkNode,
    ],
    onError: (error) => console.error("Lexical error:", error),
  };

  const handleContainerClick = useCallback(() => {
    if (!enableTimestamps || !onTimestampClick) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const offset = range.startOffset;
      let match;
      while ((match = TIMESTAMP_PATTERN.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (offset >= start && offset <= end) {
          const seconds = parseTimestampToSeconds(match[1]);
          if (seconds !== null) onTimestampClick(seconds);
          break;
        }
      }
    }
  }, [enableTimestamps, onTimestampClick]);

  return (
    <div
      className={`flex flex-col rounded-xl border shadow-sm overflow-hidden select-text transition-colors duration-150 ${
        isDark
          ? "editor-dark bg-slate-900 border-slate-800 text-slate-200"
          : "editor-light bg-white border-slate-200 text-slate-800"
      }`}
    >
      <LexicalComposer initialConfig={editorConfig}>
        <LexicalToolbar theme={theme} onToggleTheme={onToggleTheme} />

        {/* Content Area with 0ms native typing latency */}
        <div
          onClick={handleContainerClick}
          className={`relative flex-1 px-6 py-5 min-h-[380px] cursor-text transition-colors ${
            isDark ? "bg-slate-900/90 text-slate-200" : "bg-white text-slate-800"
          }`}
        >
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="outline-none min-h-[360px] text-sm leading-relaxed" />
            }
            placeholder={
              <div className="absolute top-5 left-6 text-slate-500 pointer-events-none text-sm select-none">
                # Chapter Title... Type markdown shortcuts or write notes
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <HorizontalRulePlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <MarkdownSyncPlugin
            value={value}
            onChange={onChange}
            onStatsChange={setStats}
          />
        </div>

        {/* Status Telemetry Footer */}
        <div
          className={`h-6 px-3 flex items-center justify-between text-[11px] font-mono shrink-0 border-t transition-colors ${
            isDark
              ? "bg-slate-950/80 border-slate-800 text-slate-400"
              : "bg-slate-50 border-slate-200 text-slate-500"
          }`}
        >
          <div className="flex items-center space-x-3">
            <span>{stats.wordCount} words</span>
            <span>&middot;</span>
            <span>{stats.charCount} characters</span>
          </div>
          <span className={isDark ? "text-slate-500 text-[10px]" : "text-slate-400 text-[10px]"}>
            Lexical Engine ({isDark ? "Dark" : "Light"})
          </span>
        </div>
      </LexicalComposer>
    </div>
  );
}

export default memo(MarkdownEditor);
