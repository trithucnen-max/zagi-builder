import React from 'react';

interface SkeletonProps {
  type?: 'chat' | 'grid' | 'page' | 'list';
}

export default function SkeletonLoader({ type = 'page' }: SkeletonProps) {
  // Glow-pulse animation class
  const pulseClass = 'animate-pulse bg-gray-700/60 rounded-xl';

  if (type === 'chat') {
    return (
      <div className="flex flex-1 h-full overflow-hidden bg-gray-900">
        {/* Sidebar list skeleton */}
        <div className="w-80 border-r border-gray-800 flex flex-col p-4 space-y-4 flex-shrink-0">
          <div className={`h-10 w-full ${pulseClass}`} />
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-full flex-shrink-0 ${pulseClass}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-4 w-3/4 ${pulseClass}`} />
                  <div className={`h-3 w-1/2 ${pulseClass}`} />
                </div>
              </div>
            ))}
        </div>

        {/* Chat window skeleton */}
        <div className="flex-1 flex flex-col p-4 justify-between bg-gray-900/40">
          <div className="flex items-center justify-between pb-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${pulseClass}`} />
              <div className="space-y-1.5">
                <div className={`h-4 w-32 ${pulseClass}`} />
                <div className={`h-3 w-20 ${pulseClass}`} />
              </div>
            </div>
            <div className="flex gap-2">
              <div className={`w-8 h-8 ${pulseClass}`} />
              <div className={`w-8 h-8 ${pulseClass}`} />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 py-6 overflow-hidden">
            <div className="flex items-start gap-2.5">
              <div className={`w-8 h-8 rounded-full ${pulseClass}`} />
              <div className={`h-16 w-1/3 ${pulseClass}`} />
            </div>
            <div className="flex items-start gap-2.5 justify-end">
              <div className={`h-12 w-1/4 ${pulseClass}`} />
            </div>
            <div className="flex items-start gap-2.5">
              <div className={`w-8 h-8 rounded-full ${pulseClass}`} />
              <div className={`h-20 w-1/2 ${pulseClass}`} />
            </div>
          </div>

          {/* Input field */}
          <div className={`h-14 w-full mt-auto ${pulseClass}`} />
        </div>
      </div>
    );
  }

  if (type === 'grid') {
    return (
      <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-gray-900 overflow-y-auto">
        {Array(6)
          .fill(0)
          .map((_, i) => (
            <div key={i} className="border border-gray-800/80 bg-gray-800/30 p-5 rounded-2xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`h-6 w-24 ${pulseClass}`} />
                  <div className={`w-8 h-8 rounded-full ${pulseClass}`} />
                </div>
                <div className={`h-4 w-full ${pulseClass}`} />
                <div className={`h-4 w-5/6 ${pulseClass}`} />
              </div>
              <div className="flex gap-2 pt-2 border-t border-gray-800/50">
                <div className={`h-8 w-20 ${pulseClass}`} />
                <div className={`h-8 w-20 ${pulseClass}`} />
              </div>
            </div>
          ))}
      </div>
    );
  }

  // Default Page / List skeleton
  return (
    <div className="flex-1 p-6 space-y-6 bg-gray-900 overflow-y-auto">
      <div className="flex items-center justify-between pb-4 border-b border-gray-800">
        <div className="space-y-2">
          <div className={`h-7 w-48 ${pulseClass}`} />
          <div className={`h-4 w-72 ${pulseClass}`} />
        </div>
        <div className={`h-10 w-32 ${pulseClass}`} />
      </div>

      <div className="space-y-4">
        {Array(4)
          .fill(0)
          .map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 border border-gray-800/40 rounded-2xl bg-gray-850/20">
              <div className="flex items-center gap-4 flex-1">
                <div className={`w-12 h-12 rounded-xl ${pulseClass}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-5 w-1/4 ${pulseClass}`} />
                  <div className={`h-4 w-1/2 ${pulseClass}`} />
                </div>
              </div>
              <div className={`h-8 w-24 ${pulseClass}`} />
            </div>
          ))}
      </div>
    </div>
  );
}
