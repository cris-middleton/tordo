// frontend/components/landing/useRotatingExample.ts
import { useState, useEffect, useRef, useCallback, RefObject } from 'react';

interface Options {
  count: number;
  intervalMs: number;
}

interface Result {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  containerRef: RefObject<HTMLDivElement>;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
}

export function useRotatingExample({ count, intervalMs }: Options): Result {
  const [activeIndex, setActiveIndexState] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Detect touch/mobile (no hover = no autoplay)
  useEffect(() => {
    setIsMobile(window.matchMedia('(hover: none)').matches);
  }, []);

  // IntersectionObserver: start rotating when mockup enters viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-rotation timer
  useEffect(() => {
    if (!isVisible || isPaused || reducedMotion || isMobile) return;
    const timer = setInterval(() => {
      setActiveIndexState((prev) => (prev + 1) % count);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isVisible, isPaused, reducedMotion, isMobile, count, intervalMs, resetKey]);

  // Manual index setter: also resets the timer
  const setActiveIndex = useCallback((index: number) => {
    setActiveIndexState(index);
    setResetKey((k) => k + 1);
  }, []);

  const handleMouseEnter = useCallback(() => setIsPaused(true), []);
  const handleMouseLeave = useCallback(() => setIsPaused(false), []);

  return {
    activeIndex,
    setActiveIndex,
    containerRef,
    handleMouseEnter,
    handleMouseLeave,
  };
}
