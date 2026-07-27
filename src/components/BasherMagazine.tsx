'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Loader2, ExternalLink } from 'lucide-react';
import ReactPageFlip from 'react-pageflip';
import GlareHover from '@/components/ui/GlareHover';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BasherIssue {
  id: string;
  issue_number: number;
  title: string;
  publish_date: string;
  pages: string[];
  link_url?: string | null;
}

interface Props {
  issues: BasherIssue[];
  newestIssue: BasherIssue;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};



function IssueCard({
  issue,
  onClick,
  size = 'default',
}: {
  issue: BasherIssue;
  onClick: () => void;
  size?: 'large' | 'default';
}) {
  const metaSize = size === 'large' ? 'text-xl' : 'text-sm';
  const metaWrap = size === 'large' ? 'whitespace-normal break-words w-full' : 'whitespace-normal break-words line-clamp-2 w-full';

  return (
    <motion.button
      onClick={onClick}
      className="group text-left w-full"
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
    >
      <GlareHover
        background="transparent"
        borderColor="rgba(255,255,255,0.08)"
        borderRadius="12px"
        glareColor="#ff0000"
        glareOpacity={0.35}
        className="w-full aspect-[1/1.414] relative overflow-hidden rounded-[12px]"
      >
        <Image
          src={issue.pages[0] || '/pd2ih_logo.png'}
          alt={`Wydanie ${issue.issue_number}`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 350px"
          className="object-cover"
          quality={75}
          draggable={false}
        />
      </GlareHover>

      {/* Metadata below the card — 3 separate lines */}
      <div className="mt-2 text-left">
        <div className={`${metaSize} ${metaWrap}`}>
          <span className="font-bold text-red-500">#{issue.issue_number}</span>
          {' '}
          <span className="text-slate-200">{issue.title}</span>
        </div>
        <div className={`${metaSize} text-slate-400 mt-0.5 flex items-center gap-2`}>
          ({formatDate(issue.publish_date)})
          {issue.link_url && (
            <a
              href={issue.link_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 transition-colors shrink-0"
              title="Otwórz link"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BasherMagazine({ issues, newestIssue }: Props) {
  const [selectedIssue, setSelectedIssue] = useState<BasherIssue | null>(null);
  const [modalLoaded, setModalLoaded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset loading state whenever a new issue is opened
  useEffect(() => {
    if (selectedIssue) setModalLoaded(false);
  }, [selectedIssue]);

  // ── Zoom / Pan state ──
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // ── Page size ──
  const [pageSize, setPageSize] = useState({ width: 350, height: 490 });

  useEffect(() => {
    if (!selectedIssue) return;

    const compute = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const availW = rect.width - 96;
      const availH = rect.height - 32;
      const ratio = 5 / 7;
      let pageW = availW / 2;
      let pageH = pageW / ratio;

      if (pageH > availH) {
        pageH = availH;
        pageW = pageH * ratio;
      }

      setPageSize({
        width: Math.round(Math.max(180, pageW)),
        height: Math.round(Math.max(250, pageH)),
      });
    };

    const id = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', compute);
    };
  }, [selectedIssue]);

  const resetView = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      resetView();
    });
    return () => cancelAnimationFrame(handle);
  }, [selectedIssue?.id, resetView]);

  // Close on Escape
  useEffect(() => {
    if (!selectedIssue) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIssue(null);
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [selectedIssue]);

  const goPrev = () => flipRef.current?.pageFlip()?.flipPrev?.();
  const goNext = () => flipRef.current?.pageFlip()?.flipNext?.();

  const zoomIn    = () => setZoomLevel((z) => Math.min(4, +(z + 0.25).toFixed(2)));
  const zoomOut   = () => setZoomLevel((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const zoomReset = () => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoomLevel((z) => Math.max(0.5, Math.min(4, +(z + delta).toFixed(2))));
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  }, [zoomLevel, panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && zoomLevel > 1) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, zoomLevel, panStart]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  if (issues.length === 0) {
    return null;
  }

  const olderIssues = issues;

  return (
    <>
      {/* ─── Two-column archive layout ─── */}
      <div className="flex flex-col lg:flex-row gap-10 items-start">
        {/* Left: Latest Issue */}
        <div className="w-full lg:w-1/3 max-w-[380px] mx-auto">
          <IssueCard
            issue={newestIssue}
            onClick={() => setSelectedIssue(newestIssue)}
            size="large"
          />
        </div>

        {/* Right: Older Issues */}
        {olderIssues.length > 0 && (
          <div className="w-full lg:w-2/3">
            <h2 className="text-xl font-bold mb-4 text-slate-400">Pozostałe numery</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-8 gap-y-16">
              {olderIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onClick={() => setSelectedIssue(issue)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Flipbook Modal ─── */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedIssue && (
            <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setSelectedIssue(null)}
          >
            <div
              className="relative w-[95vw] h-[95vh] flex flex-col bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                <div>
                  <p className="text-xs text-red-500 font-bold uppercase tracking-widest">
                    Basher #{selectedIssue.issue_number}
                  </p>
                  <h2 className="text-lg font-bold text-white">{selectedIssue.title}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-black/40 rounded-xl px-2 py-1.5 border border-white/5">
                    <button
                      onClick={zoomOut}
                      disabled={zoomLevel <= 0.5}
                      className="p-1 rounded-lg hover:bg-white/10 text-slate-300 disabled:text-slate-600 transition-all"
                      title="Pomniejsz"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-400 w-10 text-center font-mono select-none">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                      onClick={zoomIn}
                      disabled={zoomLevel >= 4}
                      className="p-1 rounded-lg hover:bg-white/10 text-slate-300 disabled:text-slate-600 transition-all"
                      title="Powiększ"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      onClick={zoomReset}
                      className="p-1 rounded-lg hover:bg-white/10 text-slate-400 transition-all"
                      title="Resetuj zoom"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedIssue(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Flipbook area */}
              <div
                ref={containerRef}
                className="flex-1 flex items-center justify-center overflow-hidden relative"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: zoomLevel > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
              >
                {/* Loading spinner while high-res images load */}
                {!modalLoaded && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/80">
                    <Loader2 className="w-10 h-10 text-red-500 animate-spin mb-3" />
                    <p className="text-sm text-slate-400">Ładowanie wydania...</p>
                  </div>
                )}
                <button
                  onClick={goPrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/60 text-white hover:bg-red-700/70 transition-all border border-white/10"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={goNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/60 text-white hover:bg-red-700/70 transition-all border border-white/10"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>

                <div
                  style={{
                    transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                    transformOrigin: 'center center',
                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                    willChange: 'transform',
                  }}
                >
                  <ReactPageFlip
                    ref={flipRef}
                    key={`${selectedIssue.id}-${pageSize.width}`}
                    className=""
                    style={{}}
                    width={pageSize.width}
                    height={pageSize.height}
                    size="fixed"
                    minWidth={180}
                    maxWidth={pageSize.width}
                    minHeight={250}
                    maxHeight={pageSize.height}
                    startPage={0}
                    drawShadow
                    flippingTime={700}
                    usePortrait={false}
                    startZIndex={0}
                    autoSize={false}
                    onFlip={resetView}
                    maxShadowOpacity={0.6}
                    showCover
                    mobileScrollSupport={false}
                    clickEventForward={false}
                    useMouseEvents
                    swipeDistance={30}
                    showPageCorners
                    disableFlipByClick={false}
                  >
                    {selectedIssue.pages.map((pageUrl, i) => (
                      <div
                        key={`${selectedIssue.id}-page-${i}`}
                        style={{ width: pageSize.width, height: pageSize.height }}
                        className="relative bg-slate-900 overflow-hidden"
                      >
                        <Image
                          src={pageUrl}
                          alt={`Strona ${i + 1}`}
                          fill
                          sizes={`${pageSize.width}px`}
                          className="object-contain"
                          quality={80}
                          draggable={false}
                          loading={i === 0 ? 'eager' : undefined}
                          onLoad={i === 0 ? () => setModalLoaded(true) : undefined}
                        />
                      </div>
                    ))}
                  </ReactPageFlip>
                </div>
              </div>

              <div className="text-center py-3 text-xs text-slate-500 border-t border-white/5 shrink-0 select-none">
                {selectedIssue.pages.length}&nbsp;
                {selectedIssue.pages.length === 1 ? 'strona' : 'stron'}
                &nbsp;·&nbsp;kliknij krawędź strony lub strzałki aby przewracać
                {zoomLevel !== 1 && (
                  <span className="ml-2 text-slate-600">
                    · przeciągnij aby przesuwać · Ctrl+scroll aby zoomować
                  </span>
                )}
              </div>
            </div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
