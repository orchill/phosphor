import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, CARD } from "../ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STEPS: { cmd: string; text: string }[] = [
  { cmd: "01 · local", text: "Everything runs on this machine. No accounts, no cloud, no telemetry - your files never leave this computer." },
  { cmd: "02 · pdf tools", text: "Drop PDFs or images into any tool on the PDF Tools page. Every operation writes new files - originals stay untouched." },
  { cmd: "03 · media", text: "Paste a video or audio URL in the Media Downloader. If YouTube asks for sign-in, use the Cookies / Sign-in tab with your own session." },
  { cmd: "04 · go faster", text: "Ctrl+K opens the command palette. The moon/sun button switches theme, and the event log on Home tracks everything you do." },
];

/** One-time first-launch intro. Terminal-styled, four short steps, skippable. */
export default function Onboarding({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const close = useCallback(() => {
    setStep(0);
    onClose();
  }, [onClose]);

  if (!open) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to phosphor"
        className={`w-full max-w-md ${CARD} p-5 shadow-lg`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">
            $ phosphor --intro
          </h2>
          <button
            onClick={close}
            aria-label="Skip intro"
            className="rounded-sm p-1 text-ink3 hover:bg-elev hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <p className="mt-4 font-mono text-[12px] uppercase tracking-widest text-acc">{s.cmd}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink2">{s.text}</p>

        <div className="mt-5 flex items-center gap-2">
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-none ${i <= step ? "bg-acc" : "bg-elev"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={close} className={BTN_GHOST}>skip</button>
            <button
              onClick={() => (last ? close() : setStep((s) => s + 1))}
              autoFocus
              className={BTN_PRIMARY}
            >
              {last ? "got it" : "next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
