export function PlaceholderCard() {
  return (
    <div
      className="relative w-full h-full flex flex-col justify-between rounded-lg border border-teal-400/10 bg-black/10 p-3"
      style={{ backfaceVisibility: 'hidden' }}
    >
      {/* Title placeholder - wider oval */}
      <div className="w-3/4 h-4 rounded-full bg-teal-400/20 animate-pulse" />

      {/* Provider and account placeholder row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="w-14 h-3 rounded-full bg-emerald-300/20 animate-pulse" />
        <div className="w-20 h-3 rounded-full bg-gray-400/20 animate-pulse" />
      </div>

      {/* Description placeholder - two lines */}
      <div className="space-y-1.5">
        <div className="w-full h-2.5 rounded-full bg-gray-400/20 animate-pulse" />
        <div className="w-2/3 h-2.5 rounded-full bg-gray-400/20 animate-pulse" />
      </div>

      {/* Footer placeholders */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="w-16 h-3 rounded-full bg-fuchsia-300/20 animate-pulse" />
        <div className="w-12 h-3 rounded-full bg-gray-400/20 animate-pulse" />
      </div>
    </div>
  )
}
