import { EmptyState, Panel } from "@/components/ui/primitives";

export function PlaceholderPage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <Panel>
      <EmptyState
        title={title}
        body={body}
        action={
          <span className="rounded-full bg-ivory-deep px-3 py-1 text-[11px] font-medium tracking-wide text-muted">
            Schema ready · UI in next phase
          </span>
        }
      />
    </Panel>
  );
}
