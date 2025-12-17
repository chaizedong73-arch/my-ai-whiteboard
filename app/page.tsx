"use client";

import { useMemo, useState, useEffect, useRef, memo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, MotionValue } from "framer-motion";

// --- 0. 全局样式 & 辅助函数 ---
const globalStyles = `
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
  ::selection { background: rgba(99, 102, 241, 0.3); color: white; }
  textarea:focus, input:focus { outline: none; }
  @keyframes breathe { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; text-shadow: 0 0 10px #818cf8; } 100% { transform: scale(1); opacity: 0.8; } }
  .animate-breathe { animation: breathe 2s infinite ease-in-out; }
  .gpu-accelerated { transform: translateZ(0); backface-visibility: hidden; perspective: 1000px; }
  @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Inter:wght@400;700&family=JetBrains+Mono:wght@400&display=swap');
  .font-hand { font-family: 'Caveat', cursive; }
  .font-sans { font-family: 'Inter', sans-serif; }
  .font-mono { font-family: 'JetBrains Mono', monospace; }
`;

const CARD_WIDTH = 320;
const CARD_HEIGHT = 176;
const PRESET_COLORS = ["#ef4444", "#f97316", "#fbbf24", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#000000"];
const TEXT_COLORS = ["#ffffff", "#ef4444", "#f97316", "#fbbf24", "#10b981", "#3b82f6", "#a855f7", "#000000"];
const PRESET_EMOJIS = ["🔥", "💡", "🚀", "💀", "❤️", "⭐", "✅", "⚠️", "🎵", "🌲", "💎", "🧠"];
const BG_PRESETS = [
    { name: "深邃", value: "linear-gradient(to bottom right, #0f172a, #1e1b4b)" }, 
    { name: "极光", value: "linear-gradient(to bottom right, #000000, #111827, #064e3b)" },
    { name: "日落", value: "linear-gradient(to bottom right, #1f1118, #3b0764, #1e1b4b)" },
    { name: "迷雾", value: "linear-gradient(to bottom right, #18181b, #27272a, #18181b)" },
    { name: "深海", value: "linear-gradient(to bottom right, #020617, #172554, #1e3a8a)" },
];

function getContrastColor(hex: string) {
    if (!hex || hex.length < 7) return '#ffffff';
    const r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128 ? '#000000' : '#ffffff';
}
function generateGradient(hex: string) { return `linear-gradient(135deg, ${hex} 0%, ${hex}aa 60%, ${hex}00 100%)`; }
function recommendColor(text: string): string | null {
    const COLOR_KEYWORDS: Record<string, string> = { "怒": "#ef4444", "火": "#ef4444", "喜": "#f97316", "光": "#fbbf24", "生": "#10b981", "悲": "#3b82f6", "梦": "#8b5cf6", "爱": "#ec4899", "暗": "#000000" };
    for (const [key, color] of Object.entries(COLOR_KEYWORDS)) { if (text.includes(key)) return color; }
    return null;
}

// --- 1. 类型定义 ---
type VisualType = "color" | "emoji";
interface VisualData { type: VisualType; value: string; bgColor?: string; }
interface AttributeOption { id: string; label: string; visual: VisualData; }
interface Dimension { id: string; name: string; options: AttributeOption[]; }
interface BGMData { url: string; title: string; active: boolean; }
interface Card { id: string; title: string; content: string; attributes: Record<string, string>; initialX: number; initialY: number; coverImage?: string; coverPositionY?: number; summary?: string; bgm?: BGMData; parentId: string | null; }

interface TextNode { 
    id: string; 
    text: string; 
    x: number; 
    y: number; 
    parentId: string | null;
    color: string;
    fontSize: 'S' | 'M' | 'L' | 'XL';
    fontFamily: 'hand' | 'sans' | 'mono';
    textAlign: 'left' | 'center' | 'right';
    opacity: number;
}

interface Link { id: string; from: string; to: string; offsetX: number; offsetY: number; parentId: string | null; }
interface Cluster { id: string; title: string; x: number; y: number; width: number; height: number; color: string; parentId: string | null; }

type Tool = "select" | "draw_line" | "create_card" | "draw_cluster";
type Mode = "free" | "feeling" | "topic" | "story_chain" | string;

const INITIAL_DIMENSIONS: Dimension[] = [
  { id: "dim_feeling", name: "感受", options: [{ id: "opt_sad", label: "悲伤", visual: { type: "color", value: "#3b82f6" } }, { id: "opt_happy", label: "快乐", visual: { type: "color", value: "#f97316" } }] },
  { id: "dim_topic", name: "主题", options: [{ id: "opt_idea", label: "灵感", visual: { type: "emoji", value: "💡", bgColor: "#fbbf24" } }] }
];
const INITIAL_CARDS: Card[] = [{ id: "1", parentId: null, title: "深夜地铁", summary: "城市里的孤独...", content: "看着窗外的倒影...", attributes: { "dim_feeling": "opt_sad", "dim_topic": "opt_idea" }, initialX: 100, initialY: 100 }];

// --- 2. 页面主逻辑 ---

// --- 新增：侧边栏组件 (已调整大小) ---
const Sidebar = memo(function Sidebar({
    isOpen,
    setIsOpen,
    cards,
    onNavigate,
    scopeName
}: {
    isOpen: boolean,
    setIsOpen: (v: boolean) => void,
    cards: Card[],
    onNavigate: (c: Card) => void,
    scopeName: string
}) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredCards = useMemo(() => {
        if (!searchQuery.trim()) return cards;
        const lowerQ = searchQuery.toLowerCase();
        return cards.filter(c =>
            c.title.toLowerCase().includes(lowerQ) ||
            c.content.toLowerCase().includes(lowerQ) ||
            (c.summary && c.summary.toLowerCase().includes(lowerQ))
        );
    }, [cards, searchQuery]);

    return (
        <>
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        onClick={() => setIsOpen(true)}
                        className="absolute top-6 left-6 z-[101] bg-[#1f2125] border border-[#2f3136] text-slate-300 p-3 rounded-xl shadow-xl hover:bg-[#2f3136] transition-colors"
                        title="打开目录"
                    >
                        {/* 按钮图标也稍微大一点 */}
                        <span className="text-xl">🗂️</span>
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ x: -400 }} // 配合下面的宽度调整动画起始位置
                        animate={{ x: 0 }}
                        exit={{ x: -400 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        // 修改：宽度改为 w-[400px] (原 w-80)
                        className="absolute top-0 left-0 h-full w-[400px] bg-[#15171a]/95 backdrop-blur-xl border-r border-[#2f3136] z-[102] flex flex-col shadow-2xl"
                    >
                        <div className="p-5 border-b border-[#2f3136] flex items-center justify-between bg-[#1f2125]/50">
                            {/* 修改：标题字体变大 text-xl */}
                            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-3">
                                <span className="text-2xl">📚</span> 故事目录
                            </h2>
                            <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors p-2 text-lg">✕</button>
                        </div>
                        <div className="p-5">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg">🔍</span>
                                <input
                                    type="text"
                                    placeholder="搜索..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    // 修改：输入框文字 text-base，高度增加 py-3
                                    className="w-full bg-[#1f2125] border border-[#2f3136] rounded-xl py-3 pl-11 pr-4 text-base text-slate-200 focus:border-indigo-500 transition-colors"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-6">
                            {filteredCards.length === 0 ? (
                                <div className="text-center text-slate-600 mt-10 text-base">没有找到相关卡片</div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {filteredCards.map(card => (
                                        <button
                                            key={card.id}
                                            onClick={() => onNavigate(card)}
                                            // 修改：增加内边距 p-4
                                            className="group flex flex-col gap-2 p-4 rounded-2xl hover:bg-[#25282e] border border-transparent hover:border-[#2f3136] transition-all text-left bg-[#1f2125]/30"
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                {/* 修改：卡片标题 text-lg (原 text-sm) */}
                                                <span className="font-bold text-slate-100 text-lg truncate">{card.title || "无标题"}</span>
                                                {card.parentId && <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-1 rounded border border-indigo-500/20 whitespace-nowrap ml-2">子卡片</span>}
                                            </div>
                                            {/* 修改：内容摘要 text-sm (原 text-xs)，并且允许显示2行 */}
                                            <span className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                                                {card.summary || card.content || "暂无内容..."}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-[#2f3136] bg-[#1f2125]/30">
                            <div className="text-xs text-slate-500 text-center font-medium">共 {cards.length} 张卡片 • 当前位置: <span className="text-slate-300">{scopeName}</span></div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
});

export default function MultiDimWhiteboardPage() {
  const [viewMode, setViewMode] = useState<Mode>("free");
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null); 
  const [currentScopeId, setCurrentScopeId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{id: string | null, title: string}[]>([{id: null, title: '🏠 主页'}]);
  
  const [bgStyle, setBgStyle] = useState(BG_PRESETS[0].value);
  const [showBgPicker, setShowBgPicker] = useState(false);

  const [dimensions, setDimensions] = useState<Dimension[]>(INITIAL_DIMENSIONS);
  const [cards, setCards] = useState<Card[]>(INITIAL_CARDS);
  const [textNodes, setTextNodes] = useState<TextNode[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [bgmHistory, setBgmHistory] = useState<BGMData[]>([]);
  
  const [clipboard, setClipboard] = useState<{ type: 'card' | 'text', data: any } | null>(null);

  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null); 
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [hoveredMergeTargetId, setHoveredMergeTargetId] = useState<string | null>(null); 
  
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, w: number, h: number, startX: number, startY: number} | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedTextIds, setSelectedTextIds] = useState<string[]>([]);

  const [globalDraggingCardId, setGlobalDraggingCardId] = useState<string | null>(null);
  const [hoveredBreadcrumbId, setHoveredBreadcrumbId] = useState<string | null | 'root'>(null);

  const [zenCardId, setZenCardId] = useState<string | null>(null);
  const [configCardId, setConfigCardId] = useState<string | null>(null);
  const [bgmEditingCardId, setBgmEditingCardId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  
  const [tempLine, setTempLine] = useState<{ start: {x: number, y: number}, end: {x: number, y: number} } | null>(null);
  const [tempCluster, setTempCluster] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [drawingStartCardId, setDrawingStartCardId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number, y: number } | null>(null);

  const viewportX = useMotionValue(0);
  const viewportY = useMotionValue(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const mousePos = useRef({ x: 0, y: 0 });

  // 新增：侧边栏状态
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const currentCards = useMemo(() => cards.filter(c => c.parentId === currentScopeId), [cards, currentScopeId]);
  const currentClusters = useMemo(() => clusters.filter(c => c.parentId === currentScopeId), [clusters, currentScopeId]);
  const currentTextNodes = useMemo(() => textNodes.filter(t => t.parentId === currentScopeId), [textNodes, currentScopeId]);
  const currentLinks = useMemo(() => links.filter(l => l.parentId === currentScopeId), [links, currentScopeId]);

  const cardCoordinates = useMemo(() => {
    const map = new Map<string, { x: MotionValue<number>, y: MotionValue<number> }>();
    currentCards.forEach(card => map.set(card.id, { x: new MotionValue(card.initialX), y: new MotionValue(card.initialY) }));
    return map;
  }, [currentCards]);
  const clusterCoordinates = useMemo(() => {
    const map = new Map<string, { x: MotionValue<number>, y: MotionValue<number> }>();
    currentClusters.forEach(cluster => map.set(cluster.id, { x: new MotionValue(cluster.x), y: new MotionValue(cluster.y) }));
    return map;
  }, [currentClusters]);
  const validLinks = useMemo(() => currentLinks.filter(link => cardCoordinates.has(link.from) && cardCoordinates.has(link.to)), [currentLinks, cardCoordinates]);

  const activeCard = useMemo(() => cards.find(c => c.id === zenCardId), [cards, zenCardId]);
  const configCard = useMemo(() => cards.find(c => c.id === configCardId), [cards, configCardId]);
  const bgmCard = useMemo(() => cards.find(c => c.id === bgmEditingCardId), [cards, bgmEditingCardId]);

  useEffect(() => { viewportX.set(0); viewportY.set(0); }, [currentScopeId, viewMode]);

  useEffect(() => {
    if (viewMode !== "story_chain") { if (activeTool === "draw_line") setActiveTool("select"); setSelectedLinkId(null); setTempLine(null); }
    if (viewMode !== "free") { if (activeTool === "create_card" || activeTool === "draw_cluster") setActiveTool("select"); }
    setSelectedCardId(null); setSelectedClusterId(null); setSelectedTextId(null); setSelectedCardIds([]); setSelectedTextIds([]);
  }, [viewMode, activeTool]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (editingTextId) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.code === "Space" && !e.repeat) setIsSpacePressed(true);
        if ((e.key === "Delete" || e.key === "Backspace")) handleDeleteSelected();

        if ((e.ctrlKey || e.metaKey) && e.key === 'c') handleCopy();
        if ((e.ctrlKey || e.metaKey) && e.key === 'x') handleCut();
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') handlePaste();
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === "Space") setIsSpacePressed(false); };
    const updateMousePos = (e: MouseEvent) => { mousePos.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("keydown", handleKeyDown); window.addEventListener("keyup", handleKeyUp); window.addEventListener("mousemove", updateMousePos);
    return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("keyup", handleKeyUp); window.removeEventListener("mousemove", updateMousePos); };
  }, [selectedLinkId, selectedCardId, selectedTextId, selectedClusterId, selectedCardIds, selectedTextIds, viewMode, editingTextId, clipboard, currentScopeId, viewportX, viewportY, cards, textNodes]);

  const handleDeleteSelected = () => {
      const idsToDelete = selectedCardIds.length > 0 ? selectedCardIds : (selectedCardId ? [selectedCardId] : []);
      if (idsToDelete.length > 0 && !zenCardId && !configCardId) {
          setCards(prev => prev.filter(c => !idsToDelete.includes(c.id)));
          setLinks(prev => prev.filter(l => !idsToDelete.includes(l.from) && !idsToDelete.includes(l.to)));
          setSelectedCardId(null); setSelectedCardIds([]);
      }
      const txtIdsToDelete = selectedTextIds.length > 0 ? selectedTextIds : (selectedTextId ? [selectedTextId] : []);
      if (txtIdsToDelete.length > 0 && !editingTextId) {
          setTextNodes(prev => prev.filter(t => !txtIdsToDelete.includes(t.id)));
          setSelectedTextId(null); setSelectedTextIds([]);
      }
      if (selectedClusterId) { setClusters(prev => prev.filter(c => c.id !== selectedClusterId)); setSelectedClusterId(null); }
      if (selectedLinkId) { setLinks(prev => prev.filter(l => l.id !== selectedLinkId)); setSelectedLinkId(null); }
  };

  const handleCopy = () => {
      if (selectedCardIds.length > 0) {
          const toCopy = cards.filter(c => selectedCardIds.includes(c.id));
          if(toCopy.length) setClipboard({ type: 'card', data: toCopy });
      } else if (selectedCardId) {
          const c = cards.find(x => x.id === selectedCardId);
          if(c) setClipboard({ type: 'card', data: c });
      } else if (selectedTextId) {
          const t = textNodes.find(x => x.id === selectedTextId);
          if(t) setClipboard({ type: 'text', data: t });
      }
  };

  const handleCut = () => { handleCopy(); handleDeleteSelected(); };

  const handlePaste = () => {
    if (clipboard) {
        const mouseX = (mousePos.current.x - viewportX.get());
        const mouseY = (mousePos.current.y - viewportY.get());
        if (Array.isArray(clipboard.data)) {
            if (clipboard.type === 'card') {
                const newCards = clipboard.data.map((c: Card, index: number) => ({
                    ...c, id: `card-${Date.now()}-${index}`, initialX: mouseX + (index * 20), initialY: mouseY + (index * 20), parentId: currentScopeId
                }));
                setCards(prev => [...prev, ...newCards]); setSelectedCardIds(newCards.map(c => c.id));
            }
        } else {
            if (clipboard.type === 'card') {
                const newCard: Card = { ...clipboard.data, id: `card-${Date.now()}`, initialX: mouseX, initialY: mouseY, parentId: currentScopeId };
                setCards(prev => [...prev, newCard]); setSelectedCardId(newCard.id);
            } else if (clipboard.type === 'text') {
                const newText: TextNode = { ...clipboard.data, id: `text-${Date.now()}`, x: mouseX, y: mouseY, parentId: currentScopeId };
                setTextNodes(prev => [...prev, newText]); setSelectedTextId(newText.id);
            }
        }
    }
  };

  const handleEjectToParent = () => { 
      const idsToEject = selectedCardIds.length > 0 ? selectedCardIds : (selectedCardId ? [selectedCardId] : []);
      if (idsToEject.length > 0 && currentScopeId && breadcrumbs.length > 1) {
          const targetParentId = breadcrumbs[breadcrumbs.length - 2].id;
          setCards(prev => prev.map(c => idsToEject.includes(c.id) ? { ...c, parentId: targetParentId, initialX: 100, initialY: 100 } : c));
          setSelectedCardId(null); setSelectedCardIds([]);
      }
  };

  const updateTextNode = (id: string, newText: string) => { setTextNodes(prev => prev.map(t => t.id === id ? { ...t, text: newText } : t)); };
  const finishTextEditing = (id: string) => { setEditingTextId(null); setTextNodes(prev => prev.filter(t => t.id !== id || t.text.trim() !== "")); };
  const updateTextNodeStyle = (id: string, updates: Partial<TextNode>) => { setTextNodes(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t)); };
  const handleLayerChange = (id: string, action: 'up' | 'down' | 'top' | 'bottom') => {
      setTextNodes(prev => {
          const index = prev.findIndex(t => t.id === id); if (index === -1) return prev;
          const node = prev[index]; const newArr = [...prev]; newArr.splice(index, 1);
          if (action === 'top') newArr.push(node); else if (action === 'bottom') newArr.unshift(node); else if (action === 'up') newArr.splice(Math.min(index + 1, newArr.length), 0, node); else if (action === 'down') newArr.splice(Math.max(index - 1, 0), 0, node);
          return newArr;
      });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const isMiddleClick = e.button === 1; const isSpaceDrag = isSpacePressed && e.button === 0;
    const target = e.target as Element;
    const isInteractive = target.classList.contains("interactive-element") || target.closest(".card-container") || target.closest(".text-node") || target.closest(".cluster-container") || target.closest(".floating-toolbar") || target.closest(".text-editor-panel") || target.tagName === "circle";
    
    if (!isInteractive && !isSpaceDrag && !isMiddleClick) { 
        if (activeTool === 'select' && viewMode === 'free') {
            setSelectionBox({ startX: e.clientX - viewportX.get(), startY: e.clientY - viewportY.get(), x: e.clientX - viewportX.get(), y: e.clientY - viewportY.get(), w: 0, h: 0 });
            if (!e.shiftKey) { setSelectedLinkId(null); setSelectedCardId(null); setSelectedClusterId(null); setSelectedTextId(null); setSelectedCardIds([]); setSelectedTextIds([]); setEditingTextId(null); }
        } else {
             setSelectedLinkId(null); setSelectedCardId(null); setSelectedClusterId(null); setSelectedTextId(null); setSelectedCardIds([]); setSelectedTextIds([]); setEditingTextId(null);
        }
    }
    if (isMiddleClick || isSpaceDrag) { setIsPanning(true); (e.currentTarget as Element).setPointerCapture(e.pointerId); e.preventDefault(); return; }
    
    const wx = e.clientX - viewportX.get(); const wy = e.clientY - viewportY.get();
    if (activeTool === "create_card" && viewMode === "free" && !isInteractive) {
        const newCard: Card = { id: `card-${Date.now()}`, parentId: currentScopeId, title: "新灵感", summary:"", content: "", attributes: { "dim_feeling": "opt_sad" }, initialX: wx - CARD_WIDTH/2, initialY: wy - CARD_HEIGHT/2 };
        setCards(prev => [...prev, newCard]); setActiveTool("select"); setZenCardId(newCard.id);
    }
    if (activeTool === "draw_cluster" && viewMode === "free" && !isInteractive) {
        setDragStartPos({ x: wx, y: wy }); setTempCluster({ x: wx, y: wy, w: 0, h: 0 });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) { viewportX.set(viewportX.get() + e.movementX); viewportY.set(viewportY.get() + e.movementY); return; }
    const currentX = e.clientX - viewportX.get();
    const currentY = e.clientY - viewportY.get();
    if (selectionBox) {
        const newW = Math.abs(currentX - selectionBox.startX); const newH = Math.abs(currentY - selectionBox.startY);
        const newX = Math.min(currentX, selectionBox.startX); const newY = Math.min(currentY, selectionBox.startY);
        setSelectionBox({ ...selectionBox, x: newX, y: newY, w: newW, h: newH });
        const selectedCIds: string[] = []; const selectedTIds: string[] = [];
        currentCards.forEach(c => {
            const cx = cardCoordinates.get(c.id)?.x.get() || 0; const cy = cardCoordinates.get(c.id)?.y.get() || 0;
            if (cx < newX + newW && cx + CARD_WIDTH > newX && cy < newY + newH && cy + CARD_HEIGHT > newY) selectedCIds.push(c.id);
        });
        currentTextNodes.forEach(t => { if (t.x < newX + newW && t.x + 100 > newX && t.y < newY + newH && t.y + 30 > newY) selectedTIds.push(t.id); });
        setSelectedCardIds(selectedCIds); setSelectedTextIds(selectedTIds);
        if (selectedCIds.length === 1) setSelectedCardId(selectedCIds[0]); else setSelectedCardId(null);
        if (selectedTIds.length === 1) setSelectedTextId(selectedTIds[0]); else setSelectedTextId(null);
    }
    if (activeTool === "draw_line" && tempLine) { setTempLine(prev => prev ? { ...prev, end: { x: currentX, y: currentY } } : null); }
    if (activeTool === "draw_cluster" && dragStartPos) { const x = Math.min(dragStartPos.x, currentX); const y = Math.min(dragStartPos.y, currentY); setTempCluster({ x, y, w: Math.abs(currentX - dragStartPos.x), h: Math.abs(currentY - dragStartPos.y) }); }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) { setIsPanning(false); (e.currentTarget as Element).releasePointerCapture(e.pointerId); }
    if (selectionBox) setSelectionBox(null);
    if (activeTool === "draw_line") { setTempLine(null); setDrawingStartCardId(null); }
    if (activeTool === "draw_cluster" && tempCluster) {
        if (tempCluster.w > 50 && tempCluster.h > 50) {
            const newCluster: Cluster = { id: `cluster-${Date.now()}`, parentId: currentScopeId, title: "新卡片集", x: tempCluster.x, y: tempCluster.y, width: tempCluster.w, height: tempCluster.h, color: "rgba(255, 255, 255, 0.05)" };
            setClusters(prev => [...prev, newCluster]); setActiveTool("select"); setSelectedClusterId(newCluster.id);
        }
        setTempCluster(null); setDragStartPos(null);
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
      if (viewMode !== "free" || activeTool !== "select") return;
      const target = e.target as Element; if (target.closest(".card-container") || target.closest(".text-node") || target.closest(".cluster-container") || target.closest(".floating-toolbar") || target.closest(".text-editor-panel")) return;
      const worldX = e.clientX - viewportX.get(); const worldY = e.clientY - viewportY.get() - 10;
      const newText: TextNode = { id: `text-${Date.now()}`, parentId: currentScopeId, text: "", x: worldX, y: worldY, color: '#ffffff', fontSize: 'M', fontFamily: 'sans', textAlign: 'left', opacity: 1 };
      setTextNodes(prev => [...prev, newText]); setEditingTextId(newText.id); setSelectedTextIds([newText.id]); 
  };

  const handleUpdateCard = (updatedCard: Card) => { setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c)); };
  const handleAddDimension = (name: string) => { const newDim: Dimension = { id: `dim_${Date.now()}`, name: name, options: [] }; setDimensions(prev => [...prev, newDim]); return newDim.id; };
  const handleAddOption = (dimId: string, label: string, visual: VisualData) => { const newOpt: AttributeOption = { id: `opt_${Date.now()}`, label, visual }; setDimensions(prev => prev.map(d => d.id === dimId ? { ...d, options: [...d.options, newOpt] } : d)); return newOpt.id; };
  const handleDeleteOption = (dimId: string, optId: string) => { setDimensions(prev => prev.map(d => d.id === dimId ? { ...d, options: d.options.filter(o => o.id !== optId) } : d)); };
  
  const handleCardPointerDown = (e: React.PointerEvent, cardId: string) => { 
      if (activeTool === "select") { 
          if (!e.shiftKey && !selectedCardIds.includes(cardId)) { setSelectedCardId(cardId); setSelectedCardIds([cardId]); } else if (e.shiftKey && !selectedCardIds.includes(cardId)) { setSelectedCardIds(prev => [...prev, cardId]); }
          setSelectedTextId(null); setSelectedTextIds([]);
      }
      if (activeTool === "draw_line") { 
          e.stopPropagation(); const coords = cardCoordinates.get(cardId); 
          if (coords) { const startX = coords.x.get() + CARD_WIDTH / 2; const startY = coords.y.get() + CARD_HEIGHT / 2; setDrawingStartCardId(cardId); setTempLine({ start: { x: startX, y: startY }, end: { x: startX, y: startY } }); } 
      } 
  };
  
  const handleCardPointerUp = (e: React.PointerEvent, cardId: string) => { if (activeTool === "draw_line" && drawingStartCardId) { e.stopPropagation(); if (drawingStartCardId !== cardId) { const exists = links.some(l => (l.from === drawingStartCardId && l.to === cardId) || (l.from === cardId && l.to === drawingStartCardId)); if (!exists) { const newLink: Link = { id: `link-${Date.now()}`, parentId: currentScopeId, from: drawingStartCardId, to: cardId, offsetX: 0, offsetY: 0 }; setLinks(prev => [...prev, newLink]); setSelectedLinkId(newLink.id); setActiveTool("select"); } } setTempLine(null); setDrawingStartCardId(null); } };
  
  const handleCardClick = (card: Card) => { };
  const handleContentDoubleClick = (card: Card) => { setZenCardId(card.id); setConfigCardId(null); };
  const handleSidebarDoubleClick = (card: Card) => { setConfigCardId(card.id); setZenCardId(null); };
  const handleToggleBgm = (card: Card) => { if (!card.bgm) { setBgmEditingCardId(card.id); return; } handleUpdateCard({ ...card, bgm: { ...card.bgm, active: !card.bgm.active } }); };
  const handleEditBgm = (card: Card) => { setBgmEditingCardId(card.id); };
  const handleAddBgmToHistory = (bgm: BGMData) => { setBgmHistory(prev => { if (prev.some(b => b.url === bgm.url)) return prev; return [...prev, bgm]; }); };

  const detectCollision = (draggedCardId: string): string | null => {
      if (viewMode !== "free") return null;
      const draggedCoords = cardCoordinates.get(draggedCardId); if (!draggedCoords) return null;
      const dX = draggedCoords.x.get(); const dY = draggedCoords.y.get(); const centerX = dX + CARD_WIDTH / 2; const centerY = dY + CARD_HEIGHT / 2;
      const targetCard = currentCards.find(c => { if (c.id === draggedCardId) return false; const tCoords = cardCoordinates.get(c.id); if (!tCoords) return false; const tX = tCoords.x.get(); const tY = tCoords.y.get(); return (centerX > tX && centerX < tX + CARD_WIDTH && centerY > tY && centerY < tY + CARD_HEIGHT); });
      return targetCard ? targetCard.id : null;
  };

  const handleCardRealtimeDrag = (cardId: string, dx: number, dy: number) => { 
      const mv = cardCoordinates.get(cardId); if (mv) { mv.x.set(mv.x.get() + dx); mv.y.set(mv.y.get() + dy); }
      const targetId = detectCollision(cardId); if (targetId !== hoveredMergeTargetId) { setHoveredMergeTargetId(targetId); }
  };
  
  const handleCardDragEnd = (cardId: string) => { 
      setHoveredMergeTargetId(null); setGlobalDraggingCardId(null);
      if (hoveredBreadcrumbId) { const targetScope = hoveredBreadcrumbId === 'root' ? null : hoveredBreadcrumbId; setCards(prev => prev.map(c => { if (c.id === cardId) return { ...c, parentId: targetScope, initialX: 100 + Math.random() * 50, initialY: 100 + Math.random() * 50 }; return c; })); setHoveredBreadcrumbId(null); setSelectedCardIds([]); return; }
      const targetId = detectCollision(cardId);
      if (targetId) {
          const newClusterId = `cluster-${Date.now()}`; const targetCard = cards.find(c => c.id === targetId); if (!targetCard) return; const targetCoords = cardCoordinates.get(targetId)!;
          const newCluster: Cluster = { id: newClusterId, parentId: currentScopeId, title: "新卡片集", x: targetCoords.x.get(), y: targetCoords.y.get(), width: CARD_WIDTH + 40, height: CARD_HEIGHT + 40, color: "rgba(255, 255, 255, 0.05)" };
          setClusters(prev => [...prev, newCluster]); setCards(prev => prev.map(c => { if (c.id === cardId) return { ...c, parentId: newClusterId, initialX: 40, initialY: 40 }; if (c.id === targetId) return { ...c, parentId: newClusterId, initialX: 20, initialY: 20 }; return c; })); setSelectedClusterId(newClusterId);
      } else { const mv = cardCoordinates.get(cardId); if (mv) { setCards(prev => prev.map(c => c.id === cardId ? { ...c, initialX: mv.x.get(), initialY: mv.y.get() } : c)); } }
  };

  const handleEjectFromCluster = (card: Card, clusterId: string | undefined) => {
      let targetX = 100, targetY = 100;
      if (clusterId) { const cluster = clusters.find(c => c.id === clusterId); if (cluster) { targetX = cluster.x + 50 + Math.random() * 50; targetY = cluster.y + 50 + Math.random() * 50; } }
      setCards(prev => prev.map(c => { if (c.id === card.id) return { ...c, parentId: currentScopeId, initialX: targetX, initialY: targetY }; return c; }));
  };

  const handleClusterRealtimeDrag = (clusterId: string, dx: number, dy: number) => { const cluster = currentClusters.find(c => c.id === clusterId); if (!cluster) return; const clusterCoords = clusterCoordinates.get(clusterId); if(clusterCoords) { clusterCoords.x.set(clusterCoords.x.get() + dx); clusterCoords.y.set(clusterCoords.y.get() + dy); } };
  const handleClusterDragEnd = (clusterId: string) => { const clusterMV = clusterCoordinates.get(clusterId); if (clusterMV) { setClusters(prev => prev.map(c => c.id === clusterId ? { ...c, x: clusterMV.x.get(), y: clusterMV.y.get() } : c)); } };
  const handleEnterCluster = (cluster: Cluster) => { setCurrentScopeId(cluster.id); setBreadcrumbs(prev => [...prev, { id: cluster.id, title: cluster.title }]); setActiveTool("select"); };
  const handleNavigateBreadcrumb = (index: number) => { const target = breadcrumbs[index]; setCurrentScopeId(target.id); setBreadcrumbs(prev => prev.slice(0, index + 1)); };

  const handleNavigateToCard = (card: Card) => {
    // 1. 设置选中
    setSelectedCardId(card.id);
    setSelectedCardIds([card.id]);
    setIsSidebarOpen(false); // 修复：使用正确的 setter 变量名

    // 2. 如果卡片不在当前作用域，需要跳转
    if (card.parentId !== currentScopeId) {
        const newBreadcrumbs: {id: string | null, title: string}[] = [];
        let currId = card.parentId;
        while (currId) {
            const cluster = clusters.find(c => c.id === currId);
            if (cluster) {
                newBreadcrumbs.unshift({ id: cluster.id, title: cluster.title });
                currId = cluster.parentId;
            } else { break; }
        }
        newBreadcrumbs.unshift({ id: null, title: '🏠 主页' });
        setBreadcrumbs(newBreadcrumbs);
        setCurrentScopeId(card.parentId);
    }

    // 3. 移动视口中心
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const targetX = -(card.initialX + CARD_WIDTH / 2) + screenW / 2;
    const targetY = -(card.initialY + CARD_HEIGHT / 2) + screenH / 2;
    viewportX.set(targetX);
    viewportY.set(targetY);
  };

  const groupedCards = useMemo(() => {
    const map = new Map<string, Card[]>();
    if (viewMode !== "free" && viewMode !== "story_chain") {
        const activeDim = dimensions.find(d => d.id === viewMode);
        if (activeDim) { activeDim.options.forEach(opt => map.set(opt.label, [])); map.set("未分类", []); cards.forEach((card) => { const optId = card.attributes[activeDim.id]; const opt = activeDim.options.find(o => o.id === optId); if (opt) map.get(opt.label)?.push(card); else map.get("未分类")?.push(card); }); }
    }
    return Array.from(map.entries());
  }, [viewMode, cards, dimensions]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      <div className="min-h-screen text-slate-100 flex flex-col font-sans select-none overflow-hidden transition-all duration-1000" style={{ background: bgStyle }}>
        
        <Sidebar 
            isOpen={isSidebarOpen} 
            setIsOpen={setIsSidebarOpen} 
            cards={cards} 
            onNavigate={handleNavigateToCard}
            scopeName={breadcrumbs[breadcrumbs.length - 1].title}
        />

        {viewMode === "free" && (
            <div className={`absolute top-6 z-[100] flex items-center gap-2 bg-[#1f2125]/90 backdrop-blur border border-[#2f3136] rounded-full px-4 py-2 shadow-xl transition-all duration-300 ${isSidebarOpen ? 'left-80 ml-4' : 'left-20'}`}>
                 {breadcrumbs.map((crumb, index) => {
                     const isTarget = hoveredBreadcrumbId === (crumb.id || 'root');
                     return (
                         <div key={crumb.id || 'root'} className="flex items-center relative">
                             <div onMouseEnter={() => { if (globalDraggingCardId) setHoveredBreadcrumbId(crumb.id || 'root'); }} onMouseLeave={() => { setHoveredBreadcrumbId(null); }} className={`transition-all duration-200 rounded-lg px-2 py-1 ${isTarget ? "bg-indigo-600/80 scale-110 shadow-lg ring-2 ring-indigo-400" : ""}`}>
                                 <button onClick={() => handleNavigateBreadcrumb(index)} className={`text-sm transition-colors ${index === breadcrumbs.length - 1 ? 'text-white font-bold' : 'text-slate-400 hover:text-white'}`}>{crumb.title}</button>
                             </div>
                             {index < breadcrumbs.length - 1 && <span className="mx-2 text-slate-600">/</span>}
                         </div>
                     );
                 })}
            </div>
        )}

        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3">
          <div className="flex items-center gap-1 bg-[#1f2125]/90 backdrop-blur border border-[#2f3136] rounded-full p-1.5 shadow-2xl max-w-[90vw] overflow-x-auto hide-scrollbar">
                <ModeButton active={viewMode === "free"} onClick={() => setViewMode("free")}>👻 自由</ModeButton> {dimensions.map(dim => ( <ModeButton key={dim.id} active={viewMode === dim.id} onClick={() => setViewMode(dim.id)}>🏷️ {dim.name}</ModeButton> ))} <div className="w-px h-4 bg-slate-600 mx-2 opacity-50"></div> <button onClick={() => setViewMode(viewMode === "story_chain" ? "free" : "story_chain")} className={`px-3 py-1 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 whitespace-nowrap ${viewMode === "story_chain" ? "bg-indigo-600 text-white shadow-[0_0_10px_rgba(79,70,229,0.5)]" : "text-slate-400 hover:bg-[#2f3136] hover:text-white"}`}><span>🔗</span> 故事</button> <div className="w-px h-4 bg-slate-600 mx-2 opacity-50"></div> <button onClick={() => setShowBgPicker(!showBgPicker)} className="px-2 py-1 text-xs text-gray-400 hover:text-white rounded hover:bg-[#2f3136]">🎨</button>
          </div>
          <AnimatePresence>{showBgPicker && (<motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="bg-[#1f2125]/95 backdrop-blur border border-[#2f3136] rounded-xl p-3 flex gap-2 shadow-2xl">{BG_PRESETS.map(bg => ( <button key={bg.name} onClick={() => { setBgStyle(bg.value); setShowBgPicker(false); }} className="w-8 h-8 rounded-full border border-white/20 hover:scale-110 transition-transform shadow-lg" style={{ background: bg.value }} title={bg.name} /> ))}</motion.div>)}</AnimatePresence>
          <AnimatePresence>{viewMode === "free" && (<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2 bg-[#2a2d33] border border-[#3f4148] rounded-lg p-1 shadow-xl"><ToolButton active={activeTool === "select"} onClick={() => setActiveTool("select")} icon="↖" label="选择 (V)" /><ToolButton active={activeTool === "create_card"} onClick={() => setActiveTool("create_card")} icon="🎴" label="卡片 (C)" /><ToolButton active={activeTool === "draw_cluster"} onClick={() => setActiveTool("draw_cluster")} icon="🔲" label="卡片集 (F)" /></motion.div>)}</AnimatePresence>
          <AnimatePresence>{viewMode === "story_chain" && (<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2 bg-[#2a2d33] border border-[#3f4148] rounded-lg p-1 shadow-xl"><ToolButton active={activeTool === "select"} onClick={() => setActiveTool("select")} icon="↖" label="选择 (V)" /><ToolButton active={activeTool === "draw_line"} onClick={() => setActiveTool("draw_line")} icon="⚡" label="连线 (L)" /></motion.div>)}</AnimatePresence>
        </div>

        <main className={`relative flex-1 overflow-hidden touch-none ${isPanning ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : activeTool !== "select" ? "cursor-crosshair" : "cursor-default"}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onDoubleClick={handleCanvasDoubleClick}>
          <motion.div className="absolute top-0 left-0 w-full h-full" style={{ x: viewportX, y: viewportY }}>
              <BackgroundGrid mode={viewMode} />
              
              {selectionBox && ( <div className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-[999]" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h }} /> )}

              {viewMode === "free" && ( <div className="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"> {currentClusters.map(cluster => { const coords = clusterCoordinates.get(cluster.id); if (!coords) return null; const containedCards = cards.filter(c => c.parentId === cluster.id); return ( <DraggableCluster key={cluster.id} cluster={cluster} containedCards={containedCards} dimensions={dimensions} coords={coords} isSelected={selectedClusterId === cluster.id} onSelect={() => { if(activeTool === "select") setSelectedClusterId(cluster.id) }} onDrag={(dx: number, dy: number) => handleClusterRealtimeDrag(cluster.id, dx, dy)} onDragEnd={() => handleClusterDragEnd(cluster.id)} onRename={(name: string) => setClusters(prev => prev.map(c => c.id === cluster.id ? { ...c, title: name } : c))} onDoubleClick={() => handleEnterCluster(cluster)} tool={activeTool} /> ) })} {activeTool === "draw_cluster" && tempCluster && ( <div className="absolute border-2 border-dashed border-indigo-500 bg-indigo-500/10 rounded-xl" style={{ left: tempCluster.x, top: tempCluster.y, width: tempCluster.w, height: tempCluster.h }} /> )} </div> )}
              
              <div className="absolute top-0 left-0 w-full h-full z-0 pointer-events-none">
                  {currentTextNodes.map(textNode => ( 
                      <DraggableTextNode 
                        key={textNode.id} 
                        textNode={textNode} 
                        isEditing={editingTextId === textNode.id} 
                        isSelected={selectedTextIds.includes(textNode.id)} 
                        onUpdate={(val: string) => updateTextNode(textNode.id, val)} 
                        onCommit={() => finishTextEditing(textNode.id)} 
                        onEditStart={() => setEditingTextId(textNode.id)} 
                        onSelect={(id: string) => { 
                            if (!selectedTextIds.includes(id)) setSelectedTextIds([id]); 
                            setSelectedCardIds([]); 
                        }} 
                        tool={activeTool} 
                      /> 
                   ))}
              </div>
              
              {viewMode === "story_chain" && ( <svg className="absolute -top-[5000px] -left-[5000px] w-[10000px] h-[10000px] z-[5] overflow-visible pointer-events-none"><defs><marker id="arrowhead-normal" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10" fill="#64748b" /></marker><marker id="arrowhead-selected" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10" fill="#818cf8" /></marker></defs> {validLinks.map((link) => { const sourceCoords = cardCoordinates.get(link.from)!; const targetCoords = cardCoordinates.get(link.to)!; return ( <SmartEntityLink key={link.id} link={link} sourceX={sourceCoords.x} sourceY={sourceCoords.y} targetX={targetCoords.x} targetY={targetCoords.y} isSelected={selectedLinkId === link.id} tool={activeTool} onSelect={() => { if (activeTool === "select") setSelectedLinkId(link.id); }} /> ) })} {activeTool === "draw_line" && tempLine && ( <line x1={tempLine.start.x + 5000} y1={tempLine.start.y + 5000} x2={tempLine.end.x + 5000} y2={tempLine.end.y + 5000} stroke="#818cf8" strokeWidth="2" strokeDasharray="4,4"/> )} </svg> )}
              <motion.div className="relative w-full h-full z-10 pointer-events-none" layout>
                  {(viewMode === "free" || viewMode === "story_chain") && ( <div className="relative w-full h-full"> {currentCards.map((card) => { const coords = cardCoordinates.get(card.id); if (!coords) return null; return ( <div key={card.id}> <DraggableCard card={card} coords={coords} tool={viewMode === "story_chain" ? activeTool : "select"} isSelected={selectedCardIds.includes(card.id)} isMergeTarget={hoveredMergeTargetId === card.id} dimensions={dimensions} onDrag={(dx: number, dy: number) => handleCardRealtimeDrag(card.id, dx, dy)} onDragEnd={() => handleCardDragEnd(card.id)} onPointerDown={(e: React.PointerEvent) => handleCardPointerDown(e, card.id)} onPointerUp={(e: React.PointerEvent) => handleCardPointerUp(e, card.id)} onContentDoubleClick={() => handleContentDoubleClick(card)} onSidebarDoubleClick={() => handleSidebarDoubleClick(card)} onToggleBgm={() => handleToggleBgm(card)} onEditBgm={() => handleEditBgm(card)} onClick={() => handleCardClick(card)} onDragStateChange={(dragging: boolean) => setGlobalDraggingCardId(dragging ? card.id : null)} /> </div> ) })} </div> )}
                  {(viewMode !== "free" && viewMode !== "story_chain") && ( <div className="w-full h-full flex items-center justify-center gap-12 pt-20 pointer-events-auto"> {groupedCards.map(([groupName, groupCards]) => { const activeDim = dimensions.find(d => d.id === viewMode); const opt = activeDim?.options.find(o => o.label === groupName); let groupColor = "#475569"; if (opt) { groupColor = opt.visual.type === "emoji" ? (opt.visual.bgColor || "#475569") : opt.visual.value; } return ( <motion.div key={groupName} layout className="relative"><motion.button onClick={(e) => { e.stopPropagation(); setExpandedGroup(groupName); }} className={`relative w-64 h-48 transition-opacity ${expandedGroup && expandedGroup !== groupName ? 'opacity-30' : 'opacity-100'}`} whileHover={{ y: -10 }} onPointerDown={(e) => e.stopPropagation()}><div className="absolute top-2 left-2 w-full h-full rounded-2xl bg-slate-800/50 border border-slate-700 rotate-3" />{groupCards.length > 0 && ( <motion.div layoutId={`card-${groupCards[0].id}`} className="relative h-full"><CardUI card={groupCards[0]} headerColor={groupColor} dimensions={dimensions} mode={viewMode} count={groupCards.length} /></motion.div> )}</motion.button><div className="text-center mt-4 text-slate-400 font-medium tracking-widest uppercase text-sm">{groupName} ({groupCards.length})</div></motion.div> ); })} </div> )}
              </motion.div>
          </motion.div>
          
          <AnimatePresence>{(selectedCardIds.length > 0 || selectedTextIds.length > 0) && (<FloatingToolbar onDelete={handleDeleteSelected} onCopy={handleCopy} onCut={handleCut} onEject={currentScopeId ? handleEjectToParent : undefined} />)}</AnimatePresence>
          <AnimatePresence>{selectedTextIds.length === 1 && !editingTextId && (<TextEditorPanel textNode={textNodes.find(t => t.id === selectedTextIds[0])} onUpdate={(updates: any) => selectedTextIds[0] && updateTextNodeStyle(selectedTextIds[0], updates)} onLayerChange={(action: any) => selectedTextIds[0] && handleLayerChange(selectedTextIds[0], action)} onDuplicate={() => { const t = textNodes.find(x => x.id === selectedTextIds[0]); if(t) { setClipboard({type:'text', data: t}); handleCopy(); } }} onDelete={handleDeleteSelected} />)}</AnimatePresence>
          <AnimatePresence>{expandedGroup && (<FolderView groupName={expandedGroup} clusterId={currentClusters.find(c => c.title === expandedGroup)?.id} cards={groupedCards.find(([k]) => k === expandedGroup)?.[1] || []} onClose={() => setExpandedGroup(null)} dimensions={dimensions} onEject={handleEjectFromCluster} onCardAction={{ onContentDoubleClick: handleContentDoubleClick, onSidebarDoubleClick: handleSidebarDoubleClick, onToggleBgm: handleToggleBgm, onEditBgm: handleEditBgm }} />)}</AnimatePresence>
          <AnimatePresence>{activeCard && <ZenWriter card={activeCard} dimensions={dimensions} onUpdate={handleUpdateCard} onClose={() => setZenCardId(null)} onOpenSettings={() => { setZenCardId(null); setConfigCardId(activeCard.id); }} />}</AnimatePresence>
          <AnimatePresence>{configCard && <AttributeManager card={configCard} dimensions={dimensions} onUpdate={handleUpdateCard} onClose={() => setConfigCardId(null)} onAddDimension={handleAddDimension} onAddOption={handleAddOption} onDeleteOption={handleDeleteOption} />}</AnimatePresence>
          <AnimatePresence>{bgmCard && <BgmSelector card={bgmCard} onUpdate={handleUpdateCard} onClose={() => setBgmEditingCardId(null)} bgmHistory={bgmHistory} onAddToHistory={handleAddBgmToHistory} />}</AnimatePresence>
          <div className="absolute bottom-6 left-6 z-40 pointer-events-auto"><button onPointerDown={(e) => e.stopPropagation()} onClick={() => { viewportX.set(0); viewportY.set(0); }} className="bg-[#1f2125] hover:bg-[#2f3136] text-gray-300 p-2 rounded-lg border border-[#2f3136] shadow-lg transition-colors text-xs font-bold">⌖ 归位</button></div>
        </main>
      </div>
    </>
  );
}

// --- 3. 组件库 ---

function TextEditorPanel({ textNode, onUpdate, onLayerChange, onDuplicate, onDelete }: any) {
    if (!textNode) return null;
    return (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="fixed top-24 left-6 z-[200] w-64 bg-white text-black rounded-lg shadow-2xl p-4 flex flex-col gap-4 text-editor-panel pointer-events-auto border border-gray-200" onPointerDown={(e) => e.stopPropagation()}>
            <div><div className="text-xs text-gray-500 mb-2 font-bold">颜色</div><div className="grid grid-cols-5 gap-2">{TEXT_COLORS.map(c => ( <button key={c} onClick={() => onUpdate({ color: c })} className={`w-6 h-6 rounded border border-gray-300 ${textNode.color === c ? 'ring-2 ring-indigo-500' : ''}`} style={{ backgroundColor: c }} /> ))}</div></div>
            <div><div className="text-xs text-gray-500 mb-2 font-bold">字体</div><div className="flex gap-2">{['hand', 'sans', 'mono'].map(f => ( <button key={f} onClick={() => onUpdate({ fontFamily: f })} className={`px-3 py-1 rounded border text-sm ${textNode.fontFamily === f ? 'bg-indigo-100 text-indigo-700 border-indigo-500' : 'bg-gray-100 border-gray-200'}`}>{f === 'hand' ? 'A' : f === 'sans' ? 'A' : 'A'}</button> ))}</div></div>
            <div><div className="text-xs text-gray-500 mb-2 font-bold">大小</div><div className="flex gap-2">{['S', 'M', 'L', 'XL'].map(s => ( <button key={s} onClick={() => onUpdate({ fontSize: s })} className={`w-8 h-8 flex items-center justify-center rounded border text-xs font-bold ${textNode.fontSize === s ? 'bg-indigo-100 text-indigo-700 border-indigo-500' : 'bg-gray-100 border-gray-200'}`}>{s}</button> ))}</div></div>
            <div><div className="text-xs text-gray-500 mb-2 font-bold">对齐</div><div className="flex gap-2">{['left', 'center', 'right'].map(a => ( <button key={a} onClick={() => onUpdate({ textAlign: a })} className={`w-8 h-8 flex items-center justify-center rounded border ${textNode.textAlign === a ? 'bg-indigo-100 text-indigo-700 border-indigo-500' : 'bg-gray-100 border-gray-200'}`}>{a === 'left' ? 'L' : a === 'center' ? 'C' : 'R'}</button> ))}</div></div>
            <div><div className="text-xs text-gray-500 mb-2 font-bold">透明度 ({Math.round(textNode.opacity * 100)}%)</div><input type="range" min="0.1" max="1" step="0.1" value={textNode.opacity} onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" /></div>
            <div><div className="text-xs text-gray-500 mb-2 font-bold">图层</div><div className="flex gap-2"><button onClick={() => onLayerChange('bottom')} className="p-2 bg-gray-100 rounded hover:bg-gray-200" title="置底">↓_</button><button onClick={() => onLayerChange('down')} className="p-2 bg-gray-100 rounded hover:bg-gray-200" title="下移">↓</button><button onClick={() => onLayerChange('up')} className="p-2 bg-gray-100 rounded hover:bg-gray-200" title="上移">↑</button><button onClick={() => onLayerChange('top')} className="p-2 bg-gray-100 rounded hover:bg-gray-200" title="置顶">↑_</button></div></div>
            <div><div className="text-xs text-gray-500 mb-2 font-bold">操作</div><div className="flex gap-2"><button onClick={onDuplicate} className="p-2 bg-gray-100 rounded hover:bg-gray-200">❐</button><button onClick={onDelete} className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200">🗑</button></div></div>
        </motion.div>
    )
}

function FloatingToolbar({ onDelete, onCopy, onCut, onEject }: any) {
    return (
        <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 bg-[#1a1c20]/80 backdrop-blur-md border border-[#3f4148] rounded-2xl px-6 py-3 shadow-2xl pointer-events-auto floating-toolbar" onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-4">
                <button onClick={onCopy} className="text-gray-400 hover:text-white hover:scale-110 transition-all flex flex-col items-center gap-1 group relative"><span className="text-xl">📋</span><span className="absolute -top-10 bg-black/90 text-[10px] text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">复制</span></button>
                <button onClick={onCut} className="text-gray-400 hover:text-white hover:scale-110 transition-all flex flex-col items-center gap-1 group relative"><span className="text-xl">✂️</span><span className="absolute -top-10 bg-black/90 text-[10px] text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">剪切</span></button>
                <div className="w-px h-6 bg-gray-600/50" />
                <button onClick={onDelete} className="text-gray-400 hover:text-red-400 hover:scale-110 transition-all flex flex-col items-center gap-1 group relative"><span className="text-xl">🗑️</span><span className="absolute -top-10 bg-black/90 text-[10px] text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">删除</span></button>
                {onEject && ( <> <div className="w-px h-6 bg-gray-600/50" /> <button onClick={onEject} className="text-gray-400 hover:text-indigo-400 hover:scale-110 transition-all flex flex-col items-center gap-1 group relative"><span className="text-xl">⤴</span><span className="absolute -top-10 bg-black/90 text-[10px] text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">移至上一层</span></button> </> )}
            </div>
        </motion.div>
    )
}

function DraggableTextNode({ textNode, isEditing, isSelected, onUpdate, onCommit, onEditStart, onSelect, tool }: any) {
    const [val, setVal] = useState(textNode.text); 
    const inputRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { setVal(textNode.text); }, [textNode.id]); 
    useEffect(() => { if (isEditing && inputRef.current) { inputRef.current.focus(); } }, [isEditing]);
    const fontSizeMap = { 'S': '16px', 'M': '24px', 'L': '36px', 'XL': '48px' };
    const fontFamilyMap = { 'hand': 'cursive', 'sans': 'sans-serif', 'mono': 'monospace' };

    return ( 
        <motion.div 
            layout={false}
            initial={{ x: textNode.x, y: textNode.y, opacity: 0 }} 
            animate={{ x: textNode.x, y: textNode.y, opacity: textNode.opacity }} 
            className={`absolute text-node pointer-events-auto ${isSelected ? 'ring-2 ring-indigo-500 rounded p-1' : ''}`}
            drag={!isEditing && tool === "select"} 
            dragMomentum={false} 
            onPointerDown={(e) => { e.stopPropagation(); onSelect(textNode.id); }} 
            onDoubleClick={(e) => { e.stopPropagation(); onEditStart(); }} 
            style={{ 
                color: textNode.color, 
                fontSize: fontSizeMap[textNode.fontSize as keyof typeof fontSizeMap], 
                fontFamily: fontFamilyMap[textNode.fontFamily as keyof typeof fontFamilyMap], 
                textAlign: textNode.textAlign, 
                minWidth: '50px',
                zIndex: isSelected || isEditing ? 100 : 1
            }}
        > 
            {isEditing ? ( 
                <textarea 
                    ref={inputRef} 
                    value={val} 
                    onChange={(e) => { 
                        const v = e.target.value;
                        setVal(v); 
                        onUpdate(v); 
                    }} 
                    onBlur={() => {
                        onCommit();
                    }}
                    onKeyDown={(e) => { 
                        e.stopPropagation(); 
                        if (e.key === "Enter" && !e.shiftKey) { 
                            e.preventDefault(); 
                            inputRef.current?.blur(); 
                        } 
                        if (e.key === "Escape") inputRef.current?.blur(); 
                    }} 
                    onPointerDown={(e) => e.stopPropagation()}
                    className="bg-transparent outline-none resize-none overflow-hidden" 
                    style={{ 
                        height: 'auto', 
                        minWidth: '100px', 
                        width: 'auto', 
                        color: 'inherit', 
                        fontFamily: 'inherit', 
                        fontSize: 'inherit', 
                        textAlign: 'inherit', 
                        lineHeight: 1.5, 
                        whiteSpace: 'pre-wrap' 
                    }} 
                    rows={Math.max(1, val.split('\n').length)} 
                    placeholder="输入文字..."
                /> 
            ) : ( 
                <div 
                    className="whitespace-pre-wrap cursor-text select-none" 
                    style={{ lineHeight: 1.5 }}
                >
                    {textNode.text || <span className="opacity-40 italic">输入文字...</span>}
                </div> 
            )} 
        </motion.div> 
    )
}

function FolderView({ groupName, clusterId, cards, onClose, dimensions, onEject, onCardAction }: any) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDraggingCard, setIsDraggingCard] = useState(false);
    const [aboutToEject, setAboutToEject] = useState(false);
    const containerVariants: any = { hidden: { opacity: 0, scale: 0.9, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25, staggerChildren: 0.05 } }, exit: { opacity: 0, scale: 0.95, y: 10 } };
    const cardVariants: any = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <motion.div ref={containerRef} variants={containerVariants} initial="hidden" animate="visible" exit="exit" className={`w-[90vw] h-[85vh] bg-[#1a1c20] border-2 rounded-3xl shadow-2xl flex flex-col relative transition-all duration-200 ${aboutToEject ? "border-red-500/80 bg-[#1a1c20]" : isDraggingCard ? "border-indigo-500/50" : "border-[#3f4148]"}`} onClick={(e) => e.stopPropagation()}>
                <div className={`absolute -top-16 left-0 w-full text-center transition-all duration-300 pointer-events-none z-50 ${isDraggingCard ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}><span className={`px-6 py-2 rounded-full shadow-lg border text-lg font-bold transition-colors ${aboutToEject ? "bg-red-600 text-white border-red-400 scale-110" : "bg-indigo-600 text-white border-white/20"}`}>{aboutToEject ? "👋 松手即可移出！" : "✨ 拖出黑框外部即可移出"}</span></div>
                <div className="h-14 border-b border-[#2f3136] bg-[#25282e] flex items-center justify-between px-6 z-10 shrink-0 rounded-t-3xl"><div className="flex items-center gap-3"><span className="text-2xl">📂</span><h2 className="text-lg font-bold text-white tracking-wide">{groupName}</h2><span className="text-xs font-bold text-gray-400 bg-[#1a1c20] px-2 py-1 rounded-md border border-[#2f3136]">{cards.length}</span></div><button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a1c20] border border-[#2f3136] text-gray-400 hover:text-white hover:bg-red-500/20 transition-all">✕</button></div>
                <div className="flex-1 relative bg-[#121212] overflow-visible rounded-b-3xl">
                    <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden rounded-b-3xl" style={{ backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    <div className="w-full h-full overflow-y-auto overflow-x-visible custom-scrollbar p-10">
                        <motion.div className="flex flex-wrap gap-8 content-start min-h-full pb-20">
                            {cards.map((card: Card) => {
                                const activeDim = dimensions.find((d: any) => d.id !== "free" && d.options.some((o: any) => o.id === card.attributes[d.id]));
                                const opt = activeDim?.options.find((o: any) => o.id === card.attributes[activeDim.id]);
                                const color = opt ? (opt.visual.type === "emoji" ? (opt.visual.bgColor || "#475569") : opt.visual.value) : "#475569";
                                return (
                                    <motion.div key={card.id} variants={cardVariants} layout className="relative w-80 h-44 cursor-grab active:cursor-grabbing group/card" drag dragElastic={0.2} whileHover={{ scale: 1.02, zIndex: 100 }} whileTap={{ scale: 0.98, cursor: "grabbing", zIndex: 100 }} onDragStart={() => setIsDraggingCard(true)} onDragEnd={(e, info) => { setIsDraggingCard(false); setAboutToEject(false); if (containerRef.current) { const rect = containerRef.current.getBoundingClientRect(); const { x, y } = info.point; const isOutside = x < rect.left || x > rect.right || y < rect.top || y > rect.bottom; if (isOutside && onEject && clusterId) onEject(card, clusterId); } }} onDrag={(e, info) => { if (containerRef.current) { const rect = containerRef.current.getBoundingClientRect(); const { x, y } = info.point; const isOutside = x < rect.left || x > rect.right || y < rect.top || y > rect.bottom; setAboutToEject(isOutside); } }}>
                                        <CardUI card={card} headerColor={color} dimensions={dimensions} onContentDoubleClick={() => onCardAction.onContentDoubleClick(card)} onSidebarDoubleClick={() => onCardAction.onSidebarDoubleClick(card)} onToggleBgm={() => onCardAction.onToggleBgm(card)} onEditBgm={() => onCardAction.onEditBgm(card)} />
                                        <div className="absolute -top-3 -right-3 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 pointer-events-auto scale-90 hover:scale-110"><button onClick={(e) => { e.stopPropagation(); if (onEject && clusterId) onEject(card, clusterId); }} className="bg-red-500 hover:bg-red-600 text-white w-8 h-8 rounded-full shadow-lg flex items-center justify-center border-2 border-[#1a1c20]" title="移出到上一层"><span className="text-xs font-bold">⤴</span></button></div>
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    )
}

const DraggableCluster = memo(function DraggableCluster({ cluster, coords, containedCards, dimensions, isSelected, onSelect, onDrag, onDragEnd, onRename, onDoubleClick, tool }: any) {
    const [isEditing, setIsEditing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const isEmpty = !containedCards || containedCards.length === 0;
    const topCard = containedCards && containedCards.length > 0 ? containedCards[containedCards.length - 1] : null;
    const bottomCard = containedCards && containedCards.length > 1 ? containedCards[containedCards.length - 2] : null;
    const getCardColor = (c: Card) => {
        if (!c) return "#475569";
        const activeDim = dimensions.find((d: any) => d.id !== "free" && d.options.some((o: any) => o.id === c.attributes[d.id]));
        const opt = activeDim?.options.find((o: any) => o.id === c.attributes[activeDim.id]);
        return opt ? (opt.visual.type === "emoji" ? (opt.visual.bgColor || "#475569") : opt.visual.value) : "#475569";
    };
    return (
        <motion.div style={{ x: coords.x, y: coords.y, width: isEmpty ? cluster.width : 320, height: isEmpty ? cluster.height : 176, willChange: isDragging ? "transform" : "auto" }} className={`absolute pointer-events-auto group cluster-container transform-gpu backface-hidden perspective-1000 ${isEmpty ? `border-2 rounded-2xl ${isSelected ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-700 bg-slate-800/20 hover:border-slate-600'}` : ''} ${isDragging ? "z-50 cursor-grabbing" : "z-0"}`} drag={tool === "select"} dragMomentum={false} dragElastic={0.1} onPointerDown={(e) => { if(tool === "select") { e.stopPropagation(); onSelect(); } }} onDragStart={() => setIsDragging(true)} onDrag={(e, info) => { if (tool === "select") onDrag(info.delta.x, info.delta.y); }} onDragEnd={() => { setIsDragging(false); onDragEnd(); }} onDoubleClick={(e) => { e.stopPropagation(); if(!isEditing) onDoubleClick(); }}>
            {isEmpty && ( <div className="absolute -top-8 left-0 text-sm font-bold text-slate-500 group-hover:text-slate-300 transition-colors pointer-events-auto">{isEditing ? ( <input autoFocus value={cluster.title} onChange={(e) => onRename(e.target.value)} onBlur={() => setIsEditing(false)} onKeyDown={(e) => { if(e.key==='Enter') setIsEditing(false); }} className="bg-transparent text-white outline-none border-b border-indigo-500" /> ) : cluster.title}</div> )}
            {!isEmpty && topCard && (
                <div className="relative w-full h-full">
                    {bottomCard && ( <div className="absolute top-2 left-2 w-full h-full opacity-60 transform rotate-6 scale-95 pointer-events-none"><CardUI card={bottomCard} headerColor={getCardColor(bottomCard)} dimensions={dimensions} mode="free" /><div className="absolute inset-0 bg-black/40 rounded-2xl" /></div> )}
                    <div className={`relative w-full h-full transform transition-transform ${isSelected ? 'ring-2 ring-indigo-500 rounded-2xl' : ''}`}><div className="pointer-events-none w-full h-full"><CardUI card={topCard} headerColor={getCardColor(topCard)} dimensions={dimensions} mode="free" /></div></div>
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-center pointer-events-auto cursor-text" onDoubleClick={(e) => {e.stopPropagation(); setIsEditing(true);}}>{isEditing ? ( <input autoFocus value={cluster.title} onChange={(e) => onRename(e.target.value)} onBlur={() => setIsEditing(false)} onKeyDown={(e) => { if(e.key==='Enter') setIsEditing(false); }} className="bg-transparent text-center text-white outline-none border-b border-indigo-500 min-w-[100px]" /> ) : ( <div className="text-slate-400 font-medium tracking-wider text-sm flex items-center justify-center gap-1 hover:text-white transition-colors"><span>{cluster.title}</span><span className="text-slate-600 font-bold">({containedCards.length})</span></div> )}</div>
                </div>
            )}
        </motion.div>
    )
}, (prev, next) => {
    return prev.cluster.id === next.cluster.id && prev.cluster.title === next.cluster.title && prev.cluster.width === next.cluster.width && prev.isSelected === next.isSelected && prev.containedCards === next.containedCards;
});

const CardUI = memo(function CardUI({ card, headerColor, dimensions, mode, count, onContentDoubleClick, onSidebarDoubleClick, onToggleBgm, onEditBgm }: any) {
  const textColor = getContrastColor(headerColor);
  return (
    <div className="relative w-full h-full flex rounded-2xl shadow-lg border border-[#2f3136] bg-[#1a1c20] group select-none hover:shadow-2xl transition-shadow duration-200 overflow-visible transform-gpu backface-hidden">
      <div className="w-12 bg-[#25282e] border-l border-t border-b border-[#2f3136] rounded-l-2xl flex flex-col items-center py-4 gap-2 z-20 cursor-pointer" onDoubleClick={onSidebarDoubleClick}>
         {Object.entries(card.attributes).map(([dimId, optId]) => { const dim = dimensions.find((d: Dimension) => d.id === dimId); const opt = dim?.options.find((o: AttributeOption) => o.id === optId); if (!dim || !opt) return null; return ( <div key={dimId} className="relative group/dot w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#3f4148] transition-colors cursor-help"> {opt.visual.type === "color" && ( <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: opt.visual.value }} /> )} {opt.visual.type === "emoji" && ( <span className="text-lg leading-none filter drop-shadow-md">{opt.visual.value}</span> )} <Tooltip label={dim.name} value={opt.label} sub="" /> </div> ) })}
         <div className="mt-auto relative group/dot w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#3f4148] transition-colors cursor-pointer" onClick={(e) => { e.stopPropagation(); onToggleBgm(); }} onDoubleClick={(e) => { e.stopPropagation(); onEditBgm(); }}>
             <span className={`text-lg transition-all ${card.bgm?.active ? "text-indigo-400 animate-breathe" : "text-gray-600 group-hover:text-gray-400"}`}>🎵</span>
             <Tooltip label="BGM" value={card.bgm?.title || "无音乐"} sub={card.bgm?.active ? "播放中" : "点击播放/双击更换"} />
         </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden rounded-r-2xl border-t border-r border-b border-[#2f3136] bg-[#1a1c20] cursor-text" onDoubleClick={onContentDoubleClick}>
         <div className="h-10 flex items-center px-4 justify-between relative overflow-hidden" style={{ backgroundColor: headerColor }}>
             <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
             <div className="text-sm font-bold truncate opacity-90 relative z-10" style={{ color: textColor }}>{card.title}</div>
         </div>
         <div className="flex-1 p-3 bg-[#1a1c20] relative overflow-hidden"><p className="text-xs text-gray-400 leading-relaxed line-clamp-4 font-medium">{card.content}</p></div>
      </div>
    </div>
  );
});

const DraggableCard = memo(function DraggableCard({ card, coords, tool, isSelected, isMergeTarget, dimensions, onPointerDown, onPointerUp, onClick, onContentDoubleClick, onSidebarDoubleClick, onToggleBgm, onEditBgm, onDrag, onDragEnd, onDragStateChange }: any) {
  const [isDragging, setIsDragging] = useState(false);
  const headerColor = useMemo(() => { const feelingOptId = card.attributes["dim_feeling"]; const feelingDim = dimensions.find((d: Dimension) => d.id === "dim_feeling"); const opt = feelingDim?.options.find((o: AttributeOption) => o.id === feelingOptId); if (!opt) return "#475569"; return opt.visual.type === "emoji" ? (opt.visual.bgColor || "#475569") : opt.visual.value; }, [card.attributes, dimensions]);

  return (
    <motion.div layoutId={`card-${card.id}`} style={{ x: coords.x, y: coords.y, willChange: isDragging ? "transform" : "auto" }} className={`absolute rounded-2xl interactive-element card-container pointer-events-auto transform-gpu backface-hidden perspective-1000 transition-shadow duration-200 ${tool === "select" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"} ${isSelected ? "ring-2 ring-indigo-500 shadow-2xl z-30" : "z-10"} ${isDragging ? "z-50" : ""} ${isMergeTarget ? "ring-4 ring-indigo-500/70 ring-offset-4 ring-offset-[#0f1115]" : ""}`} drag={tool === "select"} dragMomentum={false} dragElastic={0.1} 
    onPointerDown={(e) => { 
        e.stopPropagation(); 
        onPointerDown(e); 
    }} 
    onPointerUp={(e) => { if (tool === "draw_line") onPointerUp(e); }} 
    onDragStart={() => { setIsDragging(true); onDragStateChange && onDragStateChange(true); }} 
    onDrag={(e, info) => { if (tool === "select") onDrag(info.delta.x, info.delta.y); }} 
    onDragEnd={() => { setIsDragging(false); onDragStateChange && onDragStateChange(false); if(tool === "select") onDragEnd(); }} 
    onClick={onClick} animate={isDragging ? { scale: 1.05, boxShadow: "0px 15px 30px rgba(0,0,0,0.5)" } : { scale: 1, boxShadow: isMergeTarget ? "0px 0px 20px rgba(99, 102, 241, 0.3)" : "0px 4px 6px rgba(0,0,0,0.1)" }} transition={{ duration: 0.1 }}>
      <div className={`w-80 h-44 ${tool === "draw_line" ? "pointer-events-none" : ""}`}>
          <CardUI card={card} headerColor={headerColor} dimensions={dimensions} mode="free" onContentDoubleClick={onContentDoubleClick} onSidebarDoubleClick={onSidebarDoubleClick} onToggleBgm={onToggleBgm} onEditBgm={onEditBgm} />
          <AnimatePresence>
            {isMergeTarget && ( <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl pointer-events-none backdrop-blur-[2px] z-50"><motion.div initial={{ scale: 0.5, y: 10 }} animate={{ scale: 1, y: 0 }} className="bg-indigo-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-2xl flex items-center gap-2"><span>📂</span> 创建卡片集</motion.div></motion.div> )}
          </AnimatePresence>
      </div>
    </motion.div>
  );
});

function SmartEntityLink({ link, sourceX, sourceY, targetX, targetY, isSelected, onSelect, tool }: any) {
    const offsetX = useMotionValue(link.offsetX); const offsetY = useMotionValue(link.offsetY);
    const d = useTransform([sourceX, sourceY, targetX, targetY, offsetX, offsetY], ([sx, sy, tx, ty, ox, oy]) => { const offset = 5000; const c1x = (sx as number) + CARD_WIDTH / 2; const c1y = (sy as number) + CARD_HEIGHT / 2; const c2x = (tx as number) + CARD_WIDTH / 2; const c2y = (ty as number) + CARD_HEIGHT / 2; let startX, startY, endX, endY; if (Math.abs(c2x - c1x) > Math.abs(c2y - c1y)) { if (c2x > c1x) { startX = (sx as number) + CARD_WIDTH; startY = c1y; endX = (tx as number); endY = c2y; } else { startX = (sx as number); startY = c1y; endX = (tx as number) + CARD_WIDTH; endY = c2y; } } else { if (c2y > c1y) { startX = c1x; startY = (sy as number) + CARD_HEIGHT; endX = c2x; endY = (ty as number); } else { startX = c1x; startY = (sy as number); endX = c2x; endY = (ty as number) + CARD_HEIGHT; } } startX += offset; startY += offset; endX += offset; endY += offset; const midX = (startX + endX) / 2; const midY = (startY + endY) / 2; const controlX = midX + (ox as number); const controlY = midY + (oy as number); return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`; });
    const handlePos = useTransform([sourceX, sourceY, targetX, targetY, offsetX, offsetY], ([sx, sy, tx, ty, ox, oy]) => { const offset = 5000; const c1x = (sx as number) + CARD_WIDTH / 2; const c1y = (sy as number) + CARD_HEIGHT / 2; const c2x = (tx as number) + CARD_WIDTH / 2; const c2y = (ty as number) + CARD_HEIGHT / 2; let startX, startY, endX, endY; if (Math.abs(c2x - c1x) > Math.abs(c2y - c1y)) { if (c2x > c1x) { startX = (sx as number) + CARD_WIDTH; startY = c1y; endX = (tx as number); endY = c2y; } else { startX = (sx as number); startY = c1y; endX = (tx as number) + CARD_WIDTH; endY = c2y; } } else { if (c2y > c1y) { startX = c1x; startY = (sy as number) + CARD_HEIGHT; endX = c2x; endY = (ty as number); } else { startX = c1x; startY = (sy as number); endX = c2x; endY = (ty as number) + CARD_HEIGHT; } } startX += offset; startY += offset; endX += offset; endY += offset; const midX = (startX + endX) / 2; const midY = (startY + endY) / 2; const controlX = midX + (ox as number); const controlY = midY + (oy as number); return { x: 0.25 * startX + 0.5 * controlX + 0.25 * endX, y: 0.25 * startY + 0.5 * controlY + 0.25 * endY }; });
    const circleCx = useTransform(handlePos, p => p.x); const circleCy = useTransform(handlePos, p => p.y);
    const handlePointerDown = (e: React.PointerEvent) => { if (tool !== "select") return; e.stopPropagation(); e.preventDefault(); const startX = e.clientX; const startY = e.clientY; const startOffset = { x: offsetX.get(), y: offsetY.get() }; const handleMove = (ev: PointerEvent) => { offsetX.set(startOffset.x + (ev.clientX - startX) * 2); offsetY.set(startOffset.y + (ev.clientY - startY) * 2); }; const handleUp = () => { window.removeEventListener("pointermove", handleMove); window.removeEventListener("pointerup", handleUp); }; window.addEventListener("pointermove", handleMove); window.addEventListener("pointerup", handleUp); };
    return ( <g className="interactive-element pointer-events-auto"> <motion.path d={d} stroke="transparent" strokeWidth="25" fill="none" className={`cursor-pointer ${tool === "select" ? "" : "pointer-events-none"}`} onPointerDown={(e) => { e.stopPropagation(); if (tool === "select") onSelect(); }} /> {isSelected && <motion.path d={d} stroke="#a5b4fc" strokeWidth="6" fill="none" strokeOpacity="0.5" className="pointer-events-none"/>} <motion.path d={d} stroke={isSelected ? "#818cf8" : "#64748b"} strokeWidth="2" fill="none" strokeLinecap="butt" markerEnd={isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead-normal)"} className="pointer-events-none transition-colors duration-200" /> {isSelected && <motion.circle cx={circleCx} cy={circleCy} r="5" fill="#1e1b4b" stroke="#a5b4fc" strokeWidth="2" className="cursor-move pointer-events-auto hover:fill-indigo-500" onPointerDown={handlePointerDown} />} </g> );
}


function Tooltip({ label, value, sub }: any) {
  return ( <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none z-50 w-max"><div className="bg-[#25282e] border border-[#2f3136] rounded-lg p-3 shadow-xl flex flex-col gap-0.5 relative"><div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-[#25282e] border-l border-b border-[#2f3136] rotate-45" /><div className="relative z-10"><span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold block mb-0.5">{label}</span><span className="text-sm font-bold text-gray-200 block">{value}</span><span className="text-[10px] text-gray-500 block mt-1">{sub}</span></div></div></div> );
}

function ModeButton({ active, children, onClick }: any) {
  return <button onClick={onClick} className={`px-2 py-1 text-xs rounded transition-all whitespace-nowrap ${active ? "bg-indigo-600 text-white" : "text-gray-400 hover:bg-[#2f3136]"}`}>{children}</button>;
}

function ToolButton({ active, onClick, icon, label }: any) {
    return <button onClick={onClick} className={`p-2 rounded-md transition-all ${active ? "bg-indigo-500 text-white" : "text-gray-400 hover:bg-[#3f4148] hover:text-gray-200"}`} title={label}><span className="text-lg">{icon}</span></button>;
}

function BackgroundGrid({ mode }: { mode?: Mode }) {
  if (mode === "story_chain") return <div className="absolute inset-0 pointer-events-none opacity-50 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" />;
  if (mode && mode !== "free") return null;
  return <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: "radial-gradient(#475569 1px, transparent 1px)", backgroundSize: "24px 24px" }} />;
}

function ZenWriter({ card, dimensions, onUpdate, onClose, onOpenSettings }: { card: Card, dimensions: Dimension[], onUpdate: (c: Card) => void, onClose: () => void, onOpenSettings: () => void }) {
    const [localTitle, setLocalTitle] = useState(card.title); const [localContent, setLocalContent] = useState(card.content); const [localSummary, setLocalSummary] = useState(card.summary || ""); const [showCoverMenu, setShowCoverMenu] = useState(false); const [isDraggingCover, setIsDraggingCover] = useState(false); const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => { setLocalTitle(card.title); setLocalContent(card.content); setLocalSummary(card.summary || ""); }, [card.id]);
    useEffect(() => { if (card.bgm?.active && card.bgm?.url && audioRef.current) { audioRef.current.volume = 0.5; audioRef.current.play().catch(e => console.log("Auto-play blocked", e)); } }, [card.bgm]);
    const handleBlur = () => { onUpdate({ ...card, title: localTitle, content: localContent, summary: localSummary }); };
    const getHeaderColor = () => { const feelingOptId = card.attributes["dim_feeling"]; const feelingDim = dimensions.find(d => d.id === "dim_feeling"); const opt = feelingDim?.options.find(o => o.id === feelingOptId); if (!opt) return "#475569"; return opt.visual.type === "emoji" ? (opt.visual.bgColor || "#475569") : opt.visual.value; };
    const headerColor = getHeaderColor(); const handleSetCover = () => { const url = prompt("请输入图片 URL:"); if (url) onUpdate({ ...card, coverImage: url }); setShowCoverMenu(false); };
    const handleCoverDrag = (e: React.MouseEvent) => { if (!isDraggingCover || !card.coverImage) return; const deltaY = e.movementY; const currentY = card.coverPositionY || 50; const newY = Math.max(0, Math.min(100, currentY - deltaY * 0.2)); onUpdate({ ...card, coverPositionY: newY }); };
    
    const headerStyle = { background: card.coverImage ? `url(${card.coverImage})` : generateGradient(headerColor), backgroundColor: headerColor, backgroundPosition: `center ${card.coverPositionY || 50}%`, backgroundSize: 'cover' };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-auto p-4" onClick={onClose}>
            {card.bgm?.url && <audio ref={audioRef} src={card.bgm.url} loop />}
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-4xl h-[90vh] bg-[#121212] border border-[#2f3136] rounded-xl shadow-2xl overflow-hidden flex flex-col relative" onClick={(e) => e.stopPropagation()}>
                <div className={`relative group h-48 w-full flex-shrink-0 transition-colors duration-500 ${card.coverImage ? 'cursor-ns-resize' : ''}`} style={headerStyle} onMouseDown={() => setIsDraggingCover(true)} onMouseUp={() => setIsDraggingCover(false)} onMouseLeave={() => setIsDraggingCover(false)} onMouseMove={handleCoverDrag}>
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors pointer-events-none" />
                    {card.coverImage && <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-white/50 opacity-0 group-hover:opacity-100 pointer-events-none">拖拽调整视角</div>}
                    <button onClick={() => setShowCoverMenu(!showCoverMenu)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 bg-black/50 hover:bg-black/70 text-white text-xs px-3 py-1.5 rounded-md backdrop-blur border border-white/20 transition-all">更换封面</button>
                    {showCoverMenu && <div className="absolute top-12 right-4 bg-[#1a1c20] border border-[#3f4148] rounded-lg shadow-xl p-1 z-20 flex flex-col w-32"><button onClick={handleSetCover} className="text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#2f3136] rounded">自定义图片...</button><button onClick={() => onUpdate({...card, coverImage: undefined})} className="text-left px-3 py-2 text-xs text-red-400 hover:bg-[#2f3136] rounded">移除封面</button></div>}
                </div>
                <div className="relative -mt-14 mx-8 md:mx-16 z-10"><div className="bg-[#1a1c20]/95 backdrop-blur-xl border border-[#2f3136] rounded-xl shadow-2xl flex h-40 overflow-hidden"><div className="w-[35%] border-r border-[#2f3136] p-6 flex items-center"><textarea value={localTitle} onChange={(e) => setLocalTitle(e.target.value)} onBlur={handleBlur} placeholder="无标题" className="bg-transparent text-3xl font-bold text-white placeholder-gray-600 outline-none w-full leading-tight resize-none h-full flex items-center pt-2"/></div><div className="flex-1 flex flex-col"><div className="h-1/3 px-5 pt-3"><input value={localSummary} onChange={(e) => setLocalSummary(e.target.value)} onBlur={handleBlur} placeholder="一句话简述..." className="bg-transparent text-xs text-gray-500 w-full outline-none" /></div><div className="h-px w-full bg-[#2f3136]" /><div className="h-2/3 px-5 flex items-center justify-between"><div className="flex gap-4">{Object.entries(card.attributes).map(([dimId, optId]) => { const dim = dimensions.find(d => d.id === dimId); const opt = dim?.options.find(o => o.id === optId); if (!dim || !opt) return null; return ( <div key={dimId} className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#25282e] border border-[#3f4148] shadow-lg transform transition-transform hover:scale-110 active:scale-95 cursor-help" title={`${dim.name}: ${opt.label}`}>{opt.visual.type === "color" && <div className="w-6 h-6 rounded-full" style={{ backgroundColor: opt.visual.value }} />}{opt.visual.type === "emoji" && <span className="text-2xl leading-none filter drop-shadow-md">{opt.visual.value}</span>}</div> ) })}</div><button onClick={onOpenSettings} className="text-xs text-indigo-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#2f3136] transition-colors">⚙️ 设置</button></div></div></div></div>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-12 py-8 md:px-20"><textarea value={localContent} onChange={(e) => setLocalContent(e.target.value)} onBlur={handleBlur} placeholder="开始写作..." className="w-full bg-transparent text-gray-300 text-lg leading-loose resize-none outline-none custom-scrollbar min-h-[500px]" autoFocus /></div>
            </motion.div>
        </motion.div>
    )
}

function BgmSelector({ card, onUpdate, onClose, bgmHistory, onAddToHistory }: any) {
    const [customUrl, setCustomUrl] = useState(card.bgm?.url || "");
    const handleSelect = (url: string, title: string) => { onUpdate({ ...card, bgm: { url, title, active: true } }); onClose(); };
    const handleAdd = () => { if(!customUrl) return; onAddToHistory({ url: customUrl, title: "自定义音乐", active: false }); handleSelect(customUrl, "自定义音乐"); };
    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="w-[400px] bg-[#1f2125] border border-[#3f4148] rounded-2xl shadow-2xl p-6 pointer-events-auto flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-[#2f3136] pb-2"><h3 className="text-lg font-bold text-white">选择背景音乐 (BGM)</h3><button onClick={onClose} className="text-gray-500 hover:text-white">✕</button></div>
                {bgmHistory.length > 0 && <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto custom-scrollbar"><span className="text-xs text-gray-500 uppercase font-bold">最近使用</span>{bgmHistory.map((m: BGMData, i: number) => ( <button key={i} onClick={() => handleSelect(m.url, m.title)} className="p-2 rounded-lg bg-[#25282e] hover:bg-[#3f4148] text-left text-sm text-gray-300 transition-colors flex items-center gap-3"><span className="text-xs">🎵</span>{m.title}</button> ))}</div>}
                <div className="pt-2 border-t border-[#2f3136] flex flex-col gap-2">
                    <span className="text-xs text-gray-500 uppercase font-bold">自定义 URL</span>
                    <input type="text" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="音乐链接 (mp3/ogg...)" className="w-full bg-[#25282e] text-sm text-white px-3 py-2 rounded-lg outline-none border border-[#3f4148] focus:border-indigo-500" />
                    <button onClick={handleAdd} className="w-full mt-1 py-2 bg-indigo-600 text-white text-sm rounded-lg font-bold hover:bg-indigo-500">确认添加</button>
                </div>
            </div>
        </motion.div>
    );
}

function AttributeManager({ card, dimensions, onUpdate, onClose, onAddDimension, onAddOption, onDeleteOption }: any) {
    const [isAddingDim, setIsAddingDim] = useState(false); const [newDimName, setNewDimName] = useState("");
    const [addingOptionForDim, setAddingOptionForDim] = useState<string | null>(null); const [newOptionName, setNewOptionName] = useState("");
    const [visualType, setVisualType] = useState<VisualType>("color"); const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]); const [selectedEmoji, setSelectedEmoji] = useState(PRESET_EMOJIS[0]);
    const handleNewOptionNameChange = (name: string) => { setNewOptionName(name); const suggestedColor = recommendColor(name); if (suggestedColor) setSelectedColor(suggestedColor); };
    const handleCreateDimension = () => { if (!newDimName.trim()) return; const newId = onAddDimension(newDimName); onUpdate({ ...card, attributes: { ...card.attributes, [newId]: "" } }); setNewDimName(""); setIsAddingDim(false); };
    const handleCreateOption = () => { if (!addingOptionForDim || !newOptionName.trim()) return; const visual: VisualData = visualType === "color" ? { type: "color", value: selectedColor } : { type: "emoji", value: selectedEmoji, bgColor: selectedColor }; const newId = onAddOption(addingOptionForDim, newOptionName, visual); onUpdate({ ...card, attributes: { ...card.attributes, [addingOptionForDim]: newId } }); setAddingOptionForDim(null); setNewOptionName(""); };
    const updateAttribute = (dimId: string, optId: string) => { const newAttrs = { ...card.attributes }; if (newAttrs[dimId] === optId) delete newAttrs[dimId]; else newAttrs[dimId] = optId; onUpdate({ ...card, attributes: newAttrs }); };

    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="w-[600px] max-h-[70vh] bg-[#1f2125] border border-[#3f4148] rounded-2xl shadow-2xl overflow-y-auto custom-scrollbar pointer-events-auto p-8 flex flex-col gap-8 relative">
                <div className="flex justify-between items-center border-b border-[#2f3136] pb-4"><h3 className="text-2xl font-bold text-white">属性管理</h3><button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button></div>
                <div className="flex flex-col gap-8">
                    {dimensions.map((dim: Dimension) => (
                        <div key={dim.id}>
                            <div className="flex justify-between items-center mb-3"><span className="text-sm text-gray-400 font-bold uppercase tracking-wider">{dim.name}</span><button onClick={() => { const n = { ...card.attributes }; delete n[dim.id]; onUpdate({ ...card, attributes: n }); }} className="text-xs text-gray-600 hover:text-red-400">清除选择</button></div>
                            <div className="grid grid-cols-2 gap-3">
                                {dim.options.map((opt: AttributeOption) => (
                                    <div key={opt.id} className="relative group">
                                        <button onClick={() => updateAttribute(dim.id, opt.id)} className={`w-full p-3 rounded-xl border transition-all flex items-center gap-3 text-left ${card.attributes[dim.id] === opt.id ? 'bg-[#3f4148] border-gray-400 text-white shadow-md transform scale-[1.02]' : 'border-transparent bg-[#25282e] text-gray-400 hover:bg-[#2f3136] hover:text-gray-200'}`}>
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: opt.visual.type === "color" ? opt.visual.value : (opt.visual.bgColor || "#333") }}>{opt.visual.type === "emoji" && <span className="text-xl">{opt.visual.value}</span>}</div><span className="font-medium text-base">{opt.label}</span>
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); onDeleteOption(dim.id, opt.id); }} className="absolute -top-1 -right-1 w-5 h-5 bg-[#1f2125] text-gray-500 hover:text-red-400 rounded-full border border-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs z-10">✕</button>
                                    </div>
                                ))}
                                <button onClick={() => setAddingOptionForDim(dim.id)} className="p-3 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:text-indigo-400 hover:border-indigo-500/50 transition-all flex items-center justify-center gap-2"><span className="text-lg">+</span> 添加选项</button>
                            </div>
                            {addingOptionForDim === dim.id && (
                                <div className="mt-4 p-4 bg-[#15171a] rounded-xl border border-indigo-900/50 flex flex-col gap-4 animate-in fade-in">
                                    <div className="flex gap-2"><input autoFocus type="text" value={newOptionName} onChange={e => handleNewOptionNameChange(e.target.value)} placeholder="新选项名称" className="flex-1 bg-[#25282e] text-base text-white px-3 py-2 rounded-lg border border-[#3f4148] outline-none" /><button onClick={handleCreateOption} className="px-4 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-500">创建</button></div>
                                    <div className="flex gap-3 text-xs text-gray-500 font-bold uppercase tracking-wider"><button onClick={() => setVisualType("color")} className={`px-3 py-1 rounded-full ${visualType === "color" ? "bg-indigo-900/50 text-indigo-400" : "hover:text-gray-300"}`}>纯色</button><button onClick={() => setVisualType("emoji")} className={`px-3 py-1 rounded-full ${visualType === "emoji" ? "bg-indigo-900/50 text-indigo-400" : "hover:text-gray-300"}`}>Emoji</button></div>
                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">{PRESET_COLORS.map(c => (<button key={c} onClick={() => setSelectedColor(c)} className={`w-8 h-8 rounded-full flex-shrink-0 transition-transform ${selectedColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1c20] scale-110' : 'opacity-70 hover:opacity-100'}`} style={{ backgroundColor: c }} />))}<input type="color" value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)} className="w-8 h-8 p-0 border-0 bg-transparent cursor-pointer" /></div>
                                    {visualType === "emoji" && (<div className="flex items-center gap-3"><div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar flex-1">{PRESET_EMOJIS.map(e => (<button key={e} onClick={() => setSelectedEmoji(e)} className={`w-6 h-6 flex items-center justify-center rounded text-sm ${selectedEmoji === e ? 'bg-[#3f4148]' : 'hover:bg-[#25282e]'}`}>{e}</button>))}</div><input type="text" value={selectedEmoji} onChange={(e) => { const val = e.target.value; if(val) setSelectedEmoji(val); }} className="w-12 h-10 bg-[#25282e] border border-gray-600 rounded-lg text-center focus:border-indigo-500 outline-none text-2xl" placeholder="+" /></div>)}
                                </div>
                            )}
                        </div>
                    ))}
                    {!isAddingDim ? ( <button onClick={() => setIsAddingDim(true)} className="w-full py-3 border border-dashed border-gray-700 rounded-xl text-sm text-gray-500 hover:text-indigo-400 hover:border-indigo-500/50 transition-all">+ 新增维度 (Dimension)</button> ) : ( <div className="flex gap-2 animate-in fade-in"><input autoFocus type="text" value={newDimName} onChange={e => setNewDimName(e.target.value)} placeholder="输入维度名称" className="flex-1 bg-[#25282e] text-base text-white px-3 py-2 rounded-lg border border-[#3f4148] outline-none focus:border-indigo-500" onKeyDown={e => e.key === 'Enter' && handleCreateDimension()} /><button onClick={handleCreateDimension} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-500">确定</button><button onClick={() => setIsAddingDim(false)} className="px-3 text-gray-500 hover:text-white">✕</button></div> )}
                </div>
            </div>
        </motion.div>
    );
}