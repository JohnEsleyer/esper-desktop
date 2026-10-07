import { useEffect, useRef, useState } from "react";
import { AlertCircle, HelpCircle, Info, X } from "lucide-react";

export default function Modal({
  isOpen,
  type = "alert", // 'alert' | 'confirm' | 'prompt'
  title = "Notification",
  message = "",
  placeholder = "",
  initialValue = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  onConfirm,
  onClose,
}) {
  const [inputVal, setInputVal] = useState(initialValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && type === "prompt") {
      setInputVal(initialValue);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, type, initialValue]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                isDestructive
                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  : type === "prompt"
                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                  : "bg-slate-800 text-slate-300 border border-slate-700"
              }`}
            >
              {isDestructive ? (
                <AlertCircle className="w-4 h-4" />
              ) : type === "prompt" ? (
                <HelpCircle className="w-4 h-4" />
              ) : (
                <Info className="w-4 h-4" />
              )}
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-tight">{title}</h4>
              {message && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{message}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {type === "prompt" && (
          <div>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirm(inputVal);
                if (e.key === "Escape") onClose();
              }}
              placeholder={placeholder}
              className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 text-white rounded-lg px-3 py-2 text-xs outline-none"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
          {type !== "alert" && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={() => onConfirm(type === "prompt" ? inputVal : true)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition active:scale-95 shadow-sm ${
              isDestructive
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
