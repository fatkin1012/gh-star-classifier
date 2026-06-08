import { useState } from 'react';
import { HiArrowDownTray, HiArrowUpTray } from 'react-icons/hi2';
import { exportTagsJSON, importTagsJSON } from '../utils/tags';

interface ExportImportProps {
  onImportComplete?: () => void;
}

export default function ExportImport({ onImportComplete }: ExportImportProps) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const json = await exportTagsJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gh-star-tags-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Tags exported successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Export failed: ' + (err instanceof Error ? err.message : 'Unknown error') });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImporting(true);
      setMessage(null);
      try {
        const text = await file.text();
        const result = await importTagsJSON(text);
        setMessage({
          type: 'success',
          text: `Imported tags for ${result.imported} repos (${result.skipped} repos not found locally)`,
        });
        onImportComplete?.();
      } catch (err) {
        setMessage({
          type: 'error',
          text: 'Import failed: ' + (err instanceof Error ? err.message : 'Invalid file'),
        });
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <HiArrowDownTray className="w-4 h-4" />
          {exporting ? 'Exporting...' : 'Export Tags'}
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <HiArrowUpTray className="w-4 h-4" />
          {importing ? 'Importing...' : 'Import Tags'}
        </button>
      </div>
      {message && (
        <div
          className={`text-xs px-3 py-2 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
