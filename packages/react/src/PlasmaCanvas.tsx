// Thin React wrapper that mounts/unmounts the framework-free PlasmaRenderer.
// Fleshed out in Task 4 (renderer in useRef, store subscription outside React).
import { useRef } from 'react';

export function PlasmaCanvas(props: { className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  return <canvas ref={ref} className={props.className} style={props.style} />;
}
