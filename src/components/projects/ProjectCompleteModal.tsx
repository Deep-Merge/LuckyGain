import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, parse } from "date-fns";
import { PartyPopper, X } from "lucide-react";
import type { ProjectCompletionInfo } from "@/lib/db/freelance";
import { Money } from "@/components/ui/primitives";

const easePremium = [0.22, 1, 0.36, 1] as const;

const SPARKLES = [
  { left: "8%", delay: 0, size: 7, tone: "gold" as const },
  { left: "18%", delay: 0.12, size: 5, tone: "sage" as const },
  { left: "28%", delay: 0.28, size: 8, tone: "gold" as const },
  { left: "40%", delay: 0.05, size: 6, tone: "ivory" as const },
  { left: "52%", delay: 0.22, size: 7, tone: "gold" as const },
  { left: "63%", delay: 0.35, size: 5, tone: "sage" as const },
  { left: "74%", delay: 0.08, size: 8, tone: "gold" as const },
  { left: "86%", delay: 0.18, size: 6, tone: "ivory" as const },
  { left: "14%", delay: 0.42, size: 5, tone: "gold" as const },
  { left: "45%", delay: 0.5, size: 7, tone: "sage" as const },
  { left: "70%", delay: 0.48, size: 5, tone: "gold" as const },
  { left: "92%", delay: 0.3, size: 6, tone: "ivory" as const },
];

function formatDate(date: string): string {
  try {
    return format(parse(date, "yyyy-MM-dd", new Date()), "MMM d, yyyy");
  } catch {
    return date;
  }
}

export function ProjectCompleteModal({
  info,
  onClose,
}: {
  info: ProjectCompletionInfo | null;
  onClose: () => void;
}) {
  const open = Boolean(info);
  const sparkles = useMemo(() => SPARKLES, []);

  return (
    <AnimatePresence>
      {open && info ? (
        <>
          <motion.button
            type="button"
            aria-label="Dismiss celebration"
            className="project-complete-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: easePremium }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-complete-title"
            className="project-complete-modal"
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.42, ease: easePremium }}
          >
            <div className="project-complete-modal__sparkles" aria-hidden>
              {sparkles.map((s, i) => (
                <motion.span
                  key={i}
                  className={`project-complete-sparkle project-complete-sparkle--${s.tone}`}
                  style={{
                    left: s.left,
                    width: s.size,
                    height: s.size,
                  }}
                  initial={{ opacity: 0, y: 18, scale: 0.4 }}
                  animate={{
                    opacity: [0, 1, 0.85, 0],
                    y: [18, -8, -46, -78],
                    scale: [0.4, 1, 0.9, 0.5],
                    rotate: [0, 20, -10, 40],
                  }}
                  transition={{
                    duration: 2.4,
                    delay: s.delay,
                    ease: easePremium,
                    repeat: Infinity,
                    repeatDelay: 0.6,
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="project-complete-modal__close pressable"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>

            <div className="project-complete-modal__crest">
              <PartyPopper className="h-5 w-5" strokeWidth={1.8} />
            </div>

            <p className="project-complete-modal__eyebrow">All milestones released</p>
            <h2 id="project-complete-title" className="project-complete-modal__title">
              Congratulations
            </h2>
            <p className="project-complete-modal__lede">
              <span className="font-semibold text-[#3a3124]">{info.projectName}</span>
              {" · "}
              {info.clientName}
            </p>

            <div className="project-complete-modal__stats">
              <div>
                <div className="project-complete-modal__stat-label">Finished</div>
                <div className="project-complete-modal__stat-value">
                  {formatDate(info.finishDate)}
                </div>
              </div>
              <div>
                <div className="project-complete-modal__stat-label">Milestones</div>
                <div className="project-complete-modal__stat-value tabular">
                  {info.milestoneCount}
                </div>
              </div>
              <div>
                <div className="project-complete-modal__stat-label">Project net</div>
                <Money
                  cents={info.netCents}
                  className="project-complete-modal__stat-value text-[15px]"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="pressable project-complete-modal__cta"
            >
              Perfect
            </button>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
