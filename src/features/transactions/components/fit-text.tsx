'use client';

import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * One line of text that shrinks its font (from `max` down to `min` px) until it
 * fits its box. Past `min` it ends in "…". Refits when the box is resized.
 */
export function FitText({ children, className, max = 14, min = 10 }: {
  children: string;
  className?: string;
  max?: number;
  min?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    // Room for the text: the parent's width minus its other (visible) children, e.g. the chevron.
    const room = () => {
      if (!parent) return el.clientWidth;
      let w = parent.clientWidth;
      for (const c of Array.from(parent.children)) {
        if (c === el) continue;
        const r = (c as HTMLElement).getBoundingClientRect();
        if (r.width > 1) w -= r.width + 4; // + flex gap
      }
      return w;
    };
    // The text's real (sub-pixel) width; scrollWidth rounds and misses the last fraction.
    const range = document.createRange();
    const natural = () => {
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width;
    };
    const fit = () => {
      let size = max;
      el.style.fontSize = `${size}px`;
      const avail = room();
      while (size > min && natural() > avail) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    // The web font can load after the first fit and is wider than the fallback.
    let alive = true;
    document.fonts?.ready.then(() => alive && fit());
    const ro = new ResizeObserver(fit);
    ro.observe(parent ?? el);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [children, max, min]);

  return (
    <span ref={ref} className={cn('block min-w-0 truncate whitespace-nowrap', className)} style={{ fontSize: max }}>
      {children}
    </span>
  );
}
