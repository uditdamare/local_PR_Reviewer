import type { ChangedFile } from "@/types/review";

const STATUS_LABEL: Record<ChangedFile["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
};

const STATUS_COLOR: Record<ChangedFile["status"], string> = {
  added: "text-green-400",
  modified: "text-yellow-400",
  deleted: "text-red-400",
  renamed: "text-blue-400",
};

export function ChangedFiles({ files }: { files: ChangedFile[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Files changed ({files.length})
      </h3>
      <ul className="space-y-1 font-mono text-sm">
        {files.map((file) => (
          <li key={file.path} className="flex items-center gap-3 text-gray-300">
            <span className={`w-4 font-bold ${STATUS_COLOR[file.status]}`}>{STATUS_LABEL[file.status]}</span>
            <span className="truncate">{file.path}</span>
            <span className="ml-auto text-xs text-gray-500">
              +{file.insertions} -{file.deletions}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
