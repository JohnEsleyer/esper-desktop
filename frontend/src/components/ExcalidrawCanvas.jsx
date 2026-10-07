import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  MoveRight,
  Pencil,
  RotateCcw,
  Square,
  Type,
} from "lucide-react";
import Modal from "./Modal.jsx";

function ExcalidrawCanvas({ initialData, onChange }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState("pencil");
  const [strokeColor, setStrokeColor] = useState("#818cf8");
  const [strokeWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [elements, setElements] = useState(() => initialData?.elements || []);
  const [currentElement, setCurrentElement] = useState(null);

  // Modern Dialog States
  const [pendingTextPos, setPendingTextPos] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Optimized: batch grid lines into 1 single path draw call
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    const all = currentElement ? [...elements, currentElement] : elements;
    all.forEach((el) => {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (el.tool === "pencil" && el.points?.length > 1) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
      } else if (el.tool === "rect") {
        ctx.strokeRect(el.x, el.y, el.w, el.h);
      } else if (el.tool === "circle") {
        ctx.beginPath();
        const rx = Math.abs(el.w) / 2;
        const ry = Math.abs(el.h) / 2;
        ctx.ellipse(el.x + rx, el.y + ry, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (el.tool === "arrow") {
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.w, el.y + el.h);
        ctx.stroke();
        const angle = Math.atan2(el.h, el.w);
        const headLen = 12;
        ctx.beginPath();
        ctx.moveTo(el.x + el.w, el.y + el.h);
        ctx.lineTo(
          el.x + el.w - headLen * Math.cos(angle - Math.PI / 6),
          el.y + el.h - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(el.x + el.w, el.y + el.h);
        ctx.lineTo(
          el.x + el.w - headLen * Math.cos(angle + Math.PI / 6),
          el.y + el.h - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
      } else if (el.tool === "text") {
        ctx.font = "16px sans-serif";
        ctx.fillStyle = el.color;
        ctx.fillText(el.text || "Text", el.x, el.y);
      }
    });
  }, [elements, currentElement]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
      redraw();
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [redraw]);

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === "text") {
      setPendingTextPos({ x, y });
      return;
    }

    setIsDrawing(true);
    if (tool === "pencil") {
      setCurrentElement({ tool: "pencil", points: [{ x, y }], color: strokeColor, width: strokeWidth });
    } else {
      setCurrentElement({ tool, startX: x, startY: y, x, y, w: 0, h: 0, color: strokeColor, width: strokeWidth });
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawing || !currentElement) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === "pencil") {
      setCurrentElement((prev) => ({
        ...prev,
        points: [...prev.points, { x, y }],
      }));
    } else {
      setCurrentElement((prev) => ({
        ...prev,
        x: Math.min(prev.startX, x),
        y: Math.min(prev.startY, y),
        w: x - prev.startX,
        h: y - prev.startY,
      }));
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentElement) {
      const next = [...elements, currentElement];
      setElements(next);
      setCurrentElement(null);
      onChange?.({ elements: next });
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 relative overflow-hidden select-none">
      <div className="absolute top-3 left-3 z-30 flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-xl backdrop-blur space-x-1">
        <button
          onClick={() => setTool("pencil")}
          className={`p-1.5 rounded transition ${tool === "pencil" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
          title="Pencil"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => setTool("rect")}
          className={`p-1.5 rounded transition ${tool === "rect" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
          title="Rectangle"
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          onClick={() => setTool("circle")}
          className={`p-1.5 rounded transition ${tool === "circle" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
          title="Circle"
        >
          <Circle className="w-4 h-4" />
        </button>
        <button
          onClick={() => setTool("arrow")}
          className={`p-1.5 rounded transition ${tool === "arrow" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
          title="Arrow"
        >
          <MoveRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setTool("text")}
          className={`p-1.5 rounded transition ${tool === "text" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
          title="Text Label"
        >
          <Type className="w-4 h-4" />
        </button>

        <span className="w-px h-4 bg-slate-800 mx-1" />

        <div className="flex items-center space-x-1 px-1">
          {["#818cf8", "#34d399", "#f87171", "#fbbf24", "#f43f5e", "#ffffff"].map((c) => (
            <button
              key={c}
              onClick={() => setStrokeColor(c)}
              style={{ backgroundColor: c }}
              className={`w-4 h-4 rounded-full transition-transform ${strokeColor === c ? "scale-125 ring-2 ring-indigo-400" : "opacity-75"}`}
            />
          ))}
        </div>

        <span className="w-px h-4 bg-slate-800 mx-1" />

        <button
          onClick={() => setShowClearConfirm(true)}
          className="p-1.5 rounded text-slate-400 hover:text-rose-400 transition"
          title="Clear Board"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* Modern Text Input Modal */}
      <Modal
        isOpen={Boolean(pendingTextPos)}
        type="prompt"
        title="Add Text Label"
        placeholder="Type diagram label..."
        onClose={() => setPendingTextPos(null)}
        onConfirm={(text) => {
          if (text && text.trim()) {
            const next = [
              ...elements,
              { tool: "text", x: pendingTextPos.x, y: pendingTextPos.y, text: text.trim(), color: strokeColor, width: strokeWidth },
            ];
            setElements(next);
            onChange?.({ elements: next });
          }
          setPendingTextPos(null);
        }}
      />

      {/* Modern Clear Confirmation Modal */}
      <Modal
        isOpen={showClearConfirm}
        type="confirm"
        title="Clear Drawing Canvas?"
        message="This removes all lines and elements on this page's whiteboard."
        confirmText="Clear Canvas"
        isDestructive={true}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => {
          setElements([]);
          onChange?.({ elements: [] });
          setShowClearConfirm(false);
        }}
      />
    </div>
  );
}

export default memo(ExcalidrawCanvas);
