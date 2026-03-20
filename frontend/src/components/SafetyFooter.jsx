import { useState } from "react";
import VideoModal from "./VideoModal";

export default function SafetyFooter() {
  const [activeVideo, setActiveVideo] = useState(null);

  return (
    <div className="mt-12 mb-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </div>
          
          <div className="flex-1 text-center sm:text-left">
            <p className="text-sm font-medium text-slate-900">
              A player who started chest compressions and used the AED saved a player's life on Thursday 3-1-18.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Please make sure you know where the AED is located (South concession stand wall).
            </p>
            
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <button
                onClick={() => setActiveVideo({ id: "z1cyRNgzyrQ", title: "AED Instructional Video" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-rose-500">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                </svg>
                AED Instructions
              </button>
              <button
                onClick={() => setActiveVideo({ id: "CuUXdQI5LLs", title: "CPR Instructional Video" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-rose-500">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                </svg>
                CPR Instructions
              </button>
            </div>
          </div>
        </div>
      </div>

      <VideoModal
        open={!!activeVideo}
        onClose={() => setActiveVideo(null)}
        videoId={activeVideo?.id}
        title={activeVideo?.title}
      />
    </div>
  );
}
