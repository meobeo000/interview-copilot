import { Volume2, VolumeX } from "lucide-react";

interface AudioMeterProps {
  level: number;
  active: boolean;
  error?: string;
}

export function AudioMeter({ level, active, error }: AudioMeterProps) {
  if (!active) {
    return null;
  }

  const bars = [0.35, 0.65, 0.85, 1.0];

  return (
    <div className="audio-meter" title={error ?? `System audio level: ${Math.round(level * 100)}%`}>
      {level > 0.02 ? <Volume2 size={15} className="meter-icon active" /> : <VolumeX size={15} className="meter-icon" />}
      <div className="meter-bars">
        {bars.map((threshold, idx) => {
          const isLit = level >= threshold * 0.2;
          const barHeight = Math.min(100, Math.max(15, Math.round((level / threshold) * 100)));
          return (
            <span
              key={idx}
              className={`meter-bar ${isLit ? "lit" : ""}`}
              style={{ height: isLit ? `${Math.min(14, Math.max(4, Math.round(barHeight * 0.14)))}px` : "3px" }}
            />
          );
        })}
      </div>
    </div>
  );
}
