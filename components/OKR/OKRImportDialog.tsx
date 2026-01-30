import React from 'react';

export function OKRImportDialog(props: {
  isOpen: boolean;
  fileName: string;
  sheetNames: string[];
  defaultSelected: string[];
  defaultIntoNewCycle: boolean;
  onCancel: () => void;
  onConfirm: (params: { selectedSheets: string[]; importIntoNewCycle: boolean }) => void;
}) {
  const { isOpen, fileName, sheetNames, defaultSelected, defaultIntoNewCycle, onCancel, onConfirm } = props;
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [importIntoNewCycle, setImportIntoNewCycle] = React.useState(defaultIntoNewCycle);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const init: Record<string, boolean> = {};
    sheetNames.forEach((s) => {
      init[s] = defaultSelected.includes(s);
    });
    setSelected(init);
    setImportIntoNewCycle(defaultIntoNewCycle);
    const t = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen, sheetNames, defaultSelected, defaultIntoNewCycle]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const selectedSheets = sheetNames.filter((s) => selected[s]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <button type="button" aria-label="Close" onClick={onCancel} className="absolute inset-0 bg-black/50" />
      <div role="dialog" aria-modal="true" className="relative w-[92vw] max-w-xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-2xl">
        <div className="text-base font-bold text-gray-900 dark:text-gray-100">Import Excel</div>
        <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{fileName}</div>

        <div className="mt-4">
          <div className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Sheets to import</div>
          <div className="mt-2 max-h-[40vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
            {sheetNames.map((s) => (
              <label key={s} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 border-gray-200 dark:border-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(selected[s])}
                  onChange={(e) => setSelected((p) => ({ ...p, [s]: e.target.checked }))}
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">{s}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={importIntoNewCycle} onChange={(e) => setImportIntoNewCycle(e.target.checked)} />
            <span className="text-sm text-gray-900 dark:text-gray-100">Import into a new cycle (recommended)</span>
          </label>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Prevents mixing old imports with new changes and avoids “ghost” rows.</div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-10 rounded-lg px-4 text-sm font-semibold text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedSheets.length === 0}
            onClick={() => onConfirm({ selectedSheets, importIntoNewCycle })}
            className="h-10 rounded-lg px-4 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

