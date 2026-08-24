import { useMemo, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Link2Off,
  Paperclip,
  Search,
} from "lucide-react";
import type { AttachmentView } from "@/lib/db/domain";
import { Money, Panel, Pill } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { format, parseISO } from "date-fns";

type Tab = "all" | "orphans";

export function AttachmentsPage({
  attachments,
}: {
  attachments: AttachmentView[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attachments.filter((a) => {
      if (tab === "orphans" && a.orphan !== 1) return false;
      if (!q) return true;
      return (
        (a.title ?? "").toLowerCase().includes(q) ||
        a.original_filename.toLowerCase().includes(q) ||
        (a.linked_description ?? "").toLowerCase().includes(q) ||
        (a.document_type ?? "").toLowerCase().includes(q)
      );
    });
  }, [attachments, tab, query]);

  const orphanCount = attachments.filter((a) => a.orphan === 1).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="max-w-xl text-[13px] leading-relaxed text-muted">
            Screenshots and receipts live as local files. SQLite only stores
            metadata, hashes, and links — so the ledger never bloats.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-ivory-deep p-1">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12.5px] font-medium",
                tab === "all" ? "bg-white text-charcoal shadow-sm" : "text-muted",
              )}
            >
              Gallery
            </button>
            <button
              type="button"
              onClick={() => setTab("orphans")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12.5px] font-medium",
                tab === "orphans"
                  ? "bg-white text-charcoal shadow-sm"
                  : "text-muted",
              )}
            >
              Orphans ({orphanCount})
            </button>
          </div>
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files"
              className="h-9 w-[200px] rounded-xl border border-line bg-white pr-3 pl-9 text-[13px] outline-none focus:border-gold/50"
            />
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-start gap-2 py-6">
            <Paperclip className="h-5 w-5 text-gold" />
            <h3 className="font-display text-lg font-semibold text-charcoal">
              No attachments here
            </h3>
            <p className="max-w-md text-[13px] text-muted">
              Paste or drop receipts onto a transaction to build evidence without
              bloating the database.
            </p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((att) => (
            <Panel key={att.id} className="overflow-hidden p-0">
              <div
                className={cn(
                  "flex h-36 items-center justify-center",
                  att.mime_type.includes("pdf")
                    ? "bg-charcoal text-gold"
                    : "bg-gradient-to-br from-ivory-deep to-[#e8e0d0]",
                )}
              >
                {att.mime_type.includes("pdf") ? (
                  <FileText className="h-10 w-10" strokeWidth={1.5} />
                ) : (
                  <ImageIcon className="h-10 w-10 text-gold-dark/70" strokeWidth={1.5} />
                )}
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-charcoal">
                      {att.title || att.original_filename}
                    </div>
                    <div className="truncate text-[11.5px] text-muted">
                      {att.original_filename}
                    </div>
                  </div>
                  {att.document_type && (
                    <Pill tone="neutral">{att.document_type}</Pill>
                  )}
                </div>

                {att.orphan === 1 ? (
                  <div className="inline-flex items-center gap-1.5 text-[12px] text-amber">
                    <Link2Off className="h-3.5 w-3.5" />
                    Unlinked · needs review
                  </div>
                ) : (
                  <div className="text-[12px] text-muted">
                    Linked to{" "}
                    <span className="font-medium text-charcoal">
                      {att.linked_description}
                    </span>
                    {att.linked_amount_cents != null && (
                      <>
                        {" · "}
                        <Money
                          cents={att.linked_amount_cents}
                          className="text-[12px] font-semibold"
                        />
                      </>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>
                    {att.capture_date
                      ? format(parseISO(att.capture_date), "MMM d, yyyy")
                      : format(parseISO(att.created_at.slice(0, 10)), "MMM d, yyyy")}
                  </span>
                  <span className="tabular">
                    {(att.size_bytes / 1024).toFixed(0)} KB
                  </span>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
