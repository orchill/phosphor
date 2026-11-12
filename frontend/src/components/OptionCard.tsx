interface Props {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  desc?: string;
}

/** Shared radio option card (Split modes, Compress presets, ...). */
export default function OptionCard({ name, checked, onChange, label, desc }: Props) {
  return (
    <label
      className={`cursor-pointer rounded border p-3 text-sm transition-colors
        ${checked ? "border-acc bg-acc/10" : "border-line hover:border-ink3"}`}
    >
      <span className="flex items-center gap-2 font-medium text-ink">
        <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-acc" />
        {label}
      </span>
      {desc && <span className="mt-1 block text-xs leading-relaxed text-ink2">{desc}</span>}
    </label>
  );
}
