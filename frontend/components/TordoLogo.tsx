'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface TordoLogoProps {
  size?: number;
  className?: string;
}

const wingFrames = [
  'M121.6,369.4C127.4,361.9 248.3,208.4 314.8,217.9C342,221.8 354.6,237 354.6,237C370,255.6 365.8,280.9 364.8,287.3C359,322.6 328.7,351.5 297.7,364.6C279.6,372.3 269.5,371 163.9,369.8C145.4,369.6 130.5,369.4 121.5,369.4L121.6,369.4Z',
  'M85.8,290.988C93.89,286.043 261.5,185.615 320.266,218.158C344.298,231.482 350.664,250.171 350.664,250.171C358.437,273.034 345.508,295.183 342.296,300.808C324.314,331.733 285.713,347.959 252.081,349.169C232.425,349.924 223.449,345.115 125.189,306.415C107.971,299.645 94.118,294.155 85.707,290.953L85.8,290.988Z',
  'M87.319,209.86C96.629,208.064 288.808,172.762 332.437,223.84C350.274,244.743 349.685,264.477 349.685,264.477C348.95,288.614 329.078,304.826 324.098,308.968C296.416,331.628 254.577,333.293 222.654,322.637C203.981,316.454 197.26,308.804 118.801,238.115C105.049,225.738 93.999,215.741 87.244,209.793L87.319,209.86Z',
  'M124.292,124.586C133.53,126.719 323.519,172.362 342.695,236.742C350.525,263.081 341.986,280.882 341.986,280.882C331.529,302.648 306.79,309.411 300.558,311.179C266.067,320.67 227.146,305.23 202.284,282.547C187.721,269.324 184.679,259.606 141.615,163.178C134.062,146.29 128.013,132.671 124.25,124.495L124.292,124.586Z',
  'M163.095,68.849C171.291,73.614 339.334,173.317 338.646,240.489C338.351,267.965 324.936,282.452 324.936,282.452C308.519,300.16 282.886,299.318 276.411,299.166C240.655,298.051 208.027,271.807 190.971,242.795C180.961,225.862 180.924,215.679 168.251,110.835C166.021,92.469 164.263,77.672 163.082,68.75L163.095,68.849Z',
];

const FRAME_MS = 50; // 50ms per frame = 250ms total for 5 frames

export default function TordoLogo({ size = 40, className = '' }: TordoLogoProps) {
  const [frame, setFrame] = useState(0);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    const target = hovered ? 4 : 0;
    if (frame === target) return;

    const dir = hovered ? 1 : -1;
    timerRef.current = setInterval(() => {
      setFrame((f) => {
        const next = f + dir;
        if (next === target) clearTimer();
        return Math.max(0, Math.min(4, next));
      });
    }, FRAME_MS);

    return clearTimer;
  }, [hovered, clearTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tight crop around the bird body (y:141–481, x:77–476) with 2-unit margin
  const vbW = 403, vbH = 344;
  const w = Math.round(size * (vbW / vbH));

  return (
    <div
      className={`tordo-logo-wrapper ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: w, height: size, flexShrink: 0, transform: 'translateY(1px)' }}
    >
      <svg
        viewBox="75 139 403 344"
        overflow="visible"
        width={w}
        height={size}
        style={{ display: 'block' }}
        aria-label="TORDO"
        role="img"
      >
        {/* Body (shared across all 5 SVG frames) */}
        <path fill="#102858" d="M273.9,421.1L293,469.8L270.1,469.8C263.7,469.8 257.7,473.4 255.2,479.3C252.7,485.2 254.8,480.2 254.7,480.7L351,480.7C349.5,476.3 346.7,473.3 342.5,471.5C338.3,469.7 337.1,469.9 334.3,469.9L315.5,469.9L297.2,422.6L274,421.2L273.9,421.1Z"/>
        <path fill="#102858" d="M218.2,398.5L190.9,381.1L116.3,476.6C116.5,476.6 116.7,476.8 116.8,476.9C138.5,484.3 157.6,476.7 174.8,462.1C183.9,454.4 190.1,441.8 197.4,430.8C204.4,420.2 211.3,408.9 218.1,398.5L218.2,398.5Z"/>
        <path fill="#2549a8" d="M77.2,448.8L174.2,368.6L190.9,381.1C173.9,402.5 158,426.5 140.7,441.2C130.3,450.1 118.7,455.3 106.5,455.9C97.2,456.3 88.1,455.1 77.2,448.8Z"/>
        <path fill="#2848ad" d="M325.6,180.1C348,129.4 411.6,129.2 435,171.3L434.7,300.1C433.7,311.1 427.5,369.6 379.3,403.7C374.3,407.2 355.7,419.5 328.5,424.6C296.2,430.6 259.2,425 221.1,400.4C206.2,390.8 188.8,381 173,367.5C173,367.5 317,199.7 325.6,180.1Z"/>
        <ellipse fill="#fff" cx="397.8" cy="180.1" rx="14.2" ry="13.6"/>
        <path fill="#3bb" d="M435,171.5L475.5,188.6L434.8,207.4L435,171.5Z"/>
        <path fill="#102858" d="M161.3,419.4C161.3,419.4 178.4,403.3 178.2,382.4C178.2,377.4 177.1,373.2 176,369.9C181,373.6 185.9,377.3 190.9,381C167.9,410.7 161.2,419.3 161.3,419.3L161.3,419.4Z"/>

        {/* Active wing frame */}
        <path fill="#3db9bb" d={wingFrames[frame]} />
      </svg>
    </div>
  );
}
