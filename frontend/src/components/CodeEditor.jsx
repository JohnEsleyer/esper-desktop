// Zero-dependency dual-layer code editor: a transparent textarea captures
// input while a <pre> underneath renders syntax-highlighted HTML.
// Supports line numbers, Tab-to-indent (2 spaces), and Ctrl/Cmd+Enter to run.
//
// Highlighting is a small tokenizer (not regex soup): the source is split
// into comments, <script>…</script>, <style>…</style>, and tags, and each
// region is tokenized so character alignment with the textarea stays exact.

import { memo, useEffect, useMemo, useRef } from "react";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightTag(tag) {
  if (tag.startsWith("<!--")) {
    return `<span class="text-slate-500 italic">${escapeHtml(tag)}</span>`;
  }
  if (/^<!doctype/i.test(tag)) {
    const content = tag.slice(2, -1);
    return `<span class="text-indigo-400">&lt;!</span><span class="text-purple-400 font-bold">${escapeHtml(content)}</span><span class="text-indigo-400">&gt;</span>`;
  }

  let out = "";
  const startMatch = tag.match(/^<\/?([a-zA-Z0-9-:]+)/);
  if (!startMatch) return escapeHtml(tag);

  const isClosing = tag.startsWith("</");
  out += `<span class="text-indigo-400">${isClosing ? "&lt;/" : "&lt;"}</span><span class="text-rose-400 font-medium">${escapeHtml(startMatch[1])}</span>`;

  const rest = tag.slice(startMatch[0].length);
  const attrRegex = /(\s+)([a-zA-Z0-9_:-]+)(?:(\s*=\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s>]+))?|(\s*\/?>)/g;
  let lastIdx = 0;
  let match;

  while ((match = attrRegex.exec(rest)) !== null) {
    if (match.index > lastIdx) {
      out += escapeHtml(rest.slice(lastIdx, match.index));
    }
    const [, space, attrName, eq, attrVal, close] = match;
    if (space) out += space;
    if (attrName) {
      out += `<span class="text-amber-300">${escapeHtml(attrName)}</span>`;
      if (eq) out += `<span class="text-slate-400">${escapeHtml(eq)}</span>`;
      if (attrVal) out += `<span class="text-emerald-400">${escapeHtml(attrVal)}</span>`;
    }
    if (close) {
      out += `<span class="text-indigo-400">${escapeHtml(close)}</span>`;
    }
    lastIdx = attrRegex.lastIndex;
  }

  if (lastIdx < rest.length) {
    out += escapeHtml(rest.slice(lastIdx));
  }
  return out;
}

function highlightJS(code) {
  if (!code) return "";
  const tokenRegex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:const|let|var|function|return|if|else|for|while|do|new|async|await|import|export|from|class|extends|try|catch|finally|throw|switch|case|break|continue|default|typeof|instanceof|void|delete|in|of|this|super)\b)|(\b(?:true|false|null|undefined|NaN|Infinity|window|document|console|Math|Array|Object|String|Number|Boolean|Promise|JSON|requestAnimationFrame|cancelAnimationFrame|addEventListener|removeEventListener|setTimeout|setInterval)\b)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|([+\-*/%=&|<>!?:;,.()[\]{}]+)/g;

  let out = "";
  let lastIdx = 0;
  let match;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIdx) {
      out += escapeHtml(code.slice(lastIdx, match.index));
    }
    const [m, comment, str, keyword, builtin, number, fnCall, punct] = match;
    if (comment) {
      out += `<span class="text-slate-500 italic">${escapeHtml(m)}</span>`;
    } else if (str) {
      out += `<span class="text-emerald-400">${escapeHtml(m)}</span>`;
    } else if (keyword) {
      out += `<span class="text-purple-400 font-semibold">${escapeHtml(m)}</span>`;
    } else if (builtin) {
      out += `<span class="text-cyan-400">${escapeHtml(m)}</span>`;
    } else if (number) {
      out += `<span class="text-amber-400">${escapeHtml(m)}</span>`;
    } else if (fnCall) {
      out += `<span class="text-sky-300">${escapeHtml(m)}</span>`;
    } else if (punct) {
      out += `<span class="text-slate-400">${escapeHtml(m)}</span>`;
    } else {
      out += escapeHtml(m);
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < code.length) {
    out += escapeHtml(code.slice(lastIdx));
  }
  return out;
}

function highlightCSS(code) {
  if (!code) return "";
  const tokenRegex =
    /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#[0-9a-fA-F]{3,8}\b)|(\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|([a-zA-Z-]+(?=\s*:))|([{}();:,])/g;

  let out = "";
  let lastIdx = 0;
  let match;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIdx) {
      out += escapeHtml(code.slice(lastIdx, match.index));
    }
    const [m, comment, str, hex, unit, prop, punct] = match;
    if (comment) {
      out += `<span class="text-slate-500 italic">${escapeHtml(m)}</span>`;
    } else if (str) {
      out += `<span class="text-emerald-400">${escapeHtml(m)}</span>`;
    } else if (hex) {
      out += `<span class="text-teal-300 font-mono">${escapeHtml(m)}</span>`;
    } else if (unit) {
      out += `<span class="text-amber-400">${escapeHtml(m)}</span>`;
    } else if (prop) {
      out += `<span class="text-sky-300">${escapeHtml(m)}</span>`;
    } else if (punct) {
      out += `<span class="text-slate-400">${escapeHtml(m)}</span>`;
    } else {
      out += escapeHtml(m);
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < code.length) {
    out += escapeHtml(code.slice(lastIdx));
  }
  return out;
}

function highlightCode(code) {
  if (!code) return "";
  const HTML_SPLIT =
    /(<!--[\s\S]*?-->)|(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)|(<\/?[a-zA-Z0-9-:]+(?:\s+[^>]*?)?\/?>)/gi;

  let out = "";
  let lastIdx = 0;
  let match;

  while ((match = HTML_SPLIT.exec(code)) !== null) {
    if (match.index > lastIdx) {
      out += escapeHtml(code.slice(lastIdx, match.index));
    }
    const [
      m,
      comment,
      scriptOpen,
      scriptBody,
      scriptClose,
      styleOpen,
      styleBody,
      styleClose,
      tag,
    ] = match;

    if (comment) {
      out += `<span class="text-slate-500 italic">${escapeHtml(m)}</span>`;
    } else if (scriptOpen) {
      out += highlightTag(scriptOpen);
      out += highlightJS(scriptBody);
      out += highlightTag(scriptClose);
    } else if (styleOpen) {
      out += highlightTag(styleOpen);
      out += highlightCSS(styleBody);
      out += highlightTag(styleClose);
    } else if (tag) {
      out += highlightTag(tag);
    } else {
      out += escapeHtml(m);
    }
    lastIdx = HTML_SPLIT.lastIndex;
  }

  if (lastIdx < code.length) {
    out += escapeHtml(code.slice(lastIdx));
  }
  return out;
}

function CodeEditor({ value, onChange, onRun }) {
  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);

  const lineCount = (value || "").split("\n").length;
  const lineNumbers = useMemo(() => {
    let s = "";
    for (let i = 1; i <= lineCount; i++) {
      s += i + "\n";
    }
    return s;
  }, [lineCount]);

  const highlightedCode = useMemo(() => highlightCode(value), [value]);

  const syncScroll = () => {
    if (!textareaRef.current) return;
    const top = textareaRef.current.scrollTop;
    const left = textareaRef.current.scrollLeft;
    if (preRef.current) {
      preRef.current.scrollTop = top;
      preRef.current.scrollLeft = left;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = top;
    }
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (onRun) onRun();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      onChange(value.substring(0, start) + "  " + value.substring(end));
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  useEffect(() => {
    syncScroll();
  }, [value]);

  return (
    <div className="relative flex-1 flex h-full overflow-hidden bg-[#090d16] font-mono text-xs select-text min-h-0">
      {/* Line Numbers Gutter: Single pre DOM node instead of hundreds of divs */}
      <pre
        ref={gutterRef}
        aria-hidden="true"
        className="w-10 pt-3 pb-8 pr-2.5 text-right bg-[#060911] text-slate-600 select-none border-r border-slate-800/80 overflow-hidden shrink-0 leading-5 font-mono m-0"
      >
        {lineNumbers}
      </pre>

      {/* Editor Body */}
      <div className="relative flex-1 h-full overflow-hidden">
        {/* Syntax Highlighted Mirror Layer */}
        <pre
          ref={preRef}
          aria-hidden="true"
          style={{ tabSize: 2 }}
          className="absolute inset-0 m-0 p-3 pb-8 leading-5 font-mono whitespace-pre overflow-hidden pointer-events-none text-slate-200"
          dangerouslySetInnerHTML={{ __html: highlightedCode + "\n" }}
        />

        {/* Interactive Textarea Layer */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="HTML visual source code"
          style={{ tabSize: 2 }}
          className="absolute inset-0 m-0 p-3 pb-8 leading-5 font-mono bg-transparent text-transparent caret-indigo-400 border-none outline-none resize-none whitespace-pre overflow-auto selection:bg-indigo-500/30"
        />
      </div>
    </div>
  );
}

export default memo(CodeEditor);
