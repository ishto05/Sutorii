"use client";

import { useState } from "react";
import { useSutoriiStore } from "@/store/sutorii";
import { Terminal, X, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

export default function DebugPanel() {
  const { debugLogs, clearDebugLogs } = useSutoriiStore();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] p-2 bg-slate-900 border border-slate-700 rounded-full text-slate-400 hover:text-white shadow-xl transition-all hover:scale-110"
        title="Open API Debug Console"
      >
        <Terminal className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[450px] h-[600px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col font-mono text-[11px] text-slate-300 overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
      {/* Header */}
      <div className="p-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-indigo-400" />
          <span className="font-bold text-slate-100 tracking-tight">API DEBUG CONSOLE</span>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 text-[9px]">
            {debugLogs.length} logs
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={clearDebugLogs}
            className="p-1.5 hover:bg-red-900/30 rounded transition-colors text-slate-500 hover:text-red-400"
            title="Clear all logs"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-400"
            title="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Log Body */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-950/50">
        {debugLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 italic text-center p-8">
            Waiting for API traffic...<br/>
            (Calls will appear here automatically)
          </div>
        ) : (
          debugLogs.map((log) => (
            <div 
              key={log.id} 
              className={`border rounded overflow-hidden transition-colors ${
                log.error 
                    ? 'border-red-900/50 bg-red-950/20' 
                    : log.responseStatus && log.responseStatus >= 400 
                        ? 'border-orange-900/50 bg-orange-950/20'
                        : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              {/* Log Header Row */}
              <button
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                className="w-full p-2 flex items-center gap-2 hover:bg-slate-800 transition-colors text-left"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                    {expandedLog === log.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </div>
                
                <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] min-w-[32px] text-center ${
                  log.method === 'POST' ? 'bg-indigo-900 text-indigo-200' : 'bg-green-900 text-green-200'
                }`}>
                  {log.method}
                </span>

                <span className="flex-1 truncate text-slate-300 font-medium">
                    {new URL(log.url).pathname}
                </span>

                <div className="flex items-center gap-2 ml-auto">
                    {log.responseStatus && (
                        <span className={`font-bold tabular-nums px-1 rounded ${
                            log.responseStatus >= 400 ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10'
                        }`}>
                            {log.responseStatus}
                        </span>
                    )}
                    <span className="text-slate-600 font-mono tabular-nums overflow-visible whitespace-nowrap">
                        {log.durationMs || 0}ms
                    </span>
                </div>
              </button>

              {/* Expanded Detail Panel */}
              {expandedLog === log.id && (
                <div className="px-3 pb-3 pt-1 bg-black/30 border-t border-slate-800/50 text-[10px] space-y-3 overflow-x-hidden">
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500 uppercase tracking-tighter font-bold">Request Payload</span>
                            <span className="text-slate-700 text-[9px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <pre className="text-indigo-300 whitespace-pre-wrap p-2 bg-slate-900/80 rounded border border-slate-800 max-h-[150px] overflow-y-auto overflow-x-hidden break-all">
                            {JSON.stringify(log.requestBody, null, 2)}
                        </pre>
                    </div>

                    {log.responseBody && (
                        <div className="space-y-1">
                            <span className="text-slate-500 uppercase tracking-tighter font-bold">Response Body</span>
                            <pre className="text-emerald-300 whitespace-pre-wrap p-2 bg-slate-900/80 rounded border border-slate-800 max-h-[300px] overflow-y-auto overflow-x-auto break-all">
                                {JSON.stringify(log.responseBody, null, 2)}
                            </pre>
                        </div>
                    )}

                    {log.error && (
                        <div className="space-y-1">
                            <span className="text-red-500 uppercase tracking-tighter font-bold font-mono underline decoration-red-500/30 underline-offset-2">Fatal Trace</span>
                            <pre className="text-red-400 whitespace-pre-wrap p-2 bg-red-950/30 rounded border border-red-900/50">
                                {log.error}
                            </pre>
                        </div>
                    )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer / Status Area */}
      <div className="px-3 py-1.5 bg-slate-800 border-t border-slate-700 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Proxy Active
        </span>
        <span className="italic">Click to expand details</span>
      </div>
    </div>
  );
}
