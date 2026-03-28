import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { Button } from '../ui/Button';
import type { CardDispatchOutputData } from '../../types';

interface AgentOutputPanelProps {
  cardSlug: string;
  projectSlug: string;
  onClose: () => void;
}

function renderStructuredLine(event: CardDispatchOutputData): React.ReactNode {
  const { structured, chunk, timestamp } = event;
  const time = new Date(timestamp).toLocaleTimeString();

  if (structured) {
    if (structured.type === 'tool_use') {
      return (
        <div className="text-blue-300">
          <span className="text-gray-500 select-none mr-2">{time}</span>
          <span className="text-blue-400 font-semibold">▶ {structured.toolName}</span>
          {structured.content && (
            <span className="text-gray-400 ml-2 text-xs">{String(structured.content).slice(0, 120)}</span>
          )}
        </div>
      );
    }
    if (structured.type === 'result') {
      return (
        <div className="text-green-300">
          <span className="text-gray-500 select-none mr-2">{time}</span>
          <span className="text-green-400">✓</span>
          {structured.content && (
            <span className="text-gray-400 ml-2 text-xs">{String(structured.content).slice(0, 120)}</span>
          )}
        </div>
      );
    }
  }

  // Raw text lines
  return (
    <>
      {chunk.split('\n').filter(Boolean).map((line, i) => {
        let parsedLine: string = line;
        try {
          const json = JSON.parse(line);
          if (json.type === 'text' && json.text) {
            parsedLine = json.text;
          } else if (json.type === 'result' && json.output) {
            parsedLine = `✓ ${json.output}`;
          } else {
            parsedLine = line;
          }
        } catch {
          // Not JSON, render raw
        }
        return (
          <div key={i} className="text-gray-300">
            <span className="text-gray-500 select-none mr-2">{i === 0 ? time : '   '}</span>
            {parsedLine}
          </div>
        );
      })}
    </>
  );
}

export function AgentOutputPanel({ cardSlug, projectSlug, onClose }: AgentOutputPanelProps) {
  const outputEvents = useStore((state) => state.dispatchOutputs[cardSlug] ?? []);
  const loadOutputBuffer = useStore((state) => state.loadOutputBuffer);
  const dispatch = useStore((state) => state.getCardDispatch(cardSlug));

  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load historical buffer on open
  useEffect(() => {
    loadOutputBuffer(projectSlug, cardSlug);
  }, [cardSlug, projectSlug, loadOutputBuffer]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputEvents.length, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
    setAutoScroll(isNearBottom);
  };

  const handleDownload = () => {
    const text = outputEvents.map((e) => e.chunk).join('');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dispatch-${cardSlug}-output.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl bg-gray-950 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[75vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-100">Agent Output</span>
            {dispatch?.status === 'running' && (
              <span className="flex items-center gap-1.5 text-xs text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Live
              </span>
            )}
            {dispatch && dispatch.status !== 'running' && (
              <span className="text-xs text-gray-500 capitalize">{dispatch.status}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                autoScroll
                  ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
              title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
            >
              {autoScroll ? 'Auto-scroll ✓' : 'Auto-scroll'}
            </button>
            {outputEvents.length > 0 && (
              <button
                onClick={handleDownload}
                className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 transition-colors"
              >
                Download
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors ml-1"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Terminal body */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed min-h-0"
        >
          {outputEvents.length === 0 ? (
            <div className="text-gray-500 italic">
              {dispatch?.status === 'running'
                ? 'Waiting for agent output…'
                : 'No output recorded for this dispatch.'}
            </div>
          ) : (
            outputEvents.map((event, i) => (
              <div key={i} className="mb-0.5">
                {renderStructuredLine(event)}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
