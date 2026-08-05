import { useEffect, useRef } from "react";

export function AudioVisualizer({
  analyser,
  active,
  label,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let samples: Uint8Array<ArrayBuffer> | null = null;

    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const bars = 22;
      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      let levels: readonly number[];
      if (active && analyser && !reducedMotion) {
        analyser.fftSize = 64;
        samples ??= new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(samples);
        levels = Array.from({ length: bars }, (_, index) => samples?.[index] ?? 0);
      } else {
        levels = Array.from({ length: bars }, (_, index) => active ? 56 + (index % 4) * 8 : 24);
      }

      levels.forEach((level, index) => {
        const normalized = Math.max(0.12, level / 255);
        const barHeight = Math.max(3, normalized * height * 0.9);
        const x = index * (barWidth + gap);
        const y = (height - barHeight) / 2;
        context.fillStyle = active
          ? `rgba(116, 195, 178, ${0.42 + normalized * 0.5})`
          : "rgba(143, 151, 156, 0.34)";
        context.beginPath();
        context.roundRect(x, y, barWidth, barHeight, Math.min(barWidth / 2, 3));
        context.fill();
      });
      if (active && analyser && !reducedMotion) frame = window.requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, analyser]);

  return (
    <div className={`assistant-audio-visualizer${active ? " is-active" : ""}`}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <span className="ui-sr-only">{label}</span>
    </div>
  );
}
