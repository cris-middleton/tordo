// frontend/components/landing/useRotatingExample.ts
import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

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
  // Dos media queries, con `useMediaQuery` en vez de dos efectos que hacían
  // setState. La segunda además ya no se queda congelada: antes se leía una sola
  // vez al montar, así que girar la tablet no cambiaba el comportamiento.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isMobile = useMediaQuery('(hover: none)');
  const [resetKey, setResetKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);


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
