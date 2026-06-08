import { useState } from 'react';
import { HiArrowPath, HiCheckCircle, HiExclamationCircle } from 'react-icons/hi2';

interface SyncStatusProps {
  lastSyncedAt: number | null;
  totalCount: number;
  onSync: () => Promise<void>;
}

export default function SyncStatus({ lastSyncedAt, totalCount, onSync }: SyncStatusProps) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await onSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const timeAgo = lastSyncedAt
    ? formatTimeAgo(lastSyncedAt)
    : 'Never';

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500">
      <div className="flex items-center gap-2">
        {syncing ? (
          <HiArrowPath className="w-3.5 h-3.5 animate-spin text-blue-500" />
        ) : error ? (
          <HiExclamationCircle className="w-3.5 h-3.5 text-red-500" />
        ) : (
          <HiCheckCircle className="w-3.5 h-3.5 text-green-500" />
        )}
        <span>{totalCount} repos</span>
        <span>·</span>
        <span>Synced {timeAgo}</span>
      </div>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-1 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
      >
        <HiArrowPath className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
        Sync
      </button>
    </div>
  );
}

function formatTimeAgo(epochMs: number): string {
  const seconds = Math.floor((Date.now() - epochMs) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
