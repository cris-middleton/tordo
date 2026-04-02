interface TordoLogoProps {
  size?: number;
  className?: string;
}

export default function TordoLogo({ size = 40, className = '' }: TordoLogoProps) {
  // Tight crop around the actual bird (x:70–485, y:125–500) — fills the container
  const w = Math.round(size * (415 / 375));
  return (
    <div
      className={`tordo-logo-wrapper ${className}`}
      style={{ position: 'relative', width: w, height: size, display: 'inline-block', flexShrink: 0 }}
    >
      {/* Wing animation overlay — overflow visible so wings extend beyond the crop box */}
      <svg
        viewBox="70 125 415 375"
        overflow="visible"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {/* Soft glow behind bird on hover */}
        <ellipse
          className="tordo-glow"
          cx="295"
          cy="335"
          rx="115"
          ry="100"
          fill="#3db9bb"
        />

        {/* Left wing — primary */}
        <path
          className="tordo-wing tordo-wing-left"
          d="M 215 368 C 158 302 88 238 44 142"
          fill="none"
          stroke="#3db9bb"
          strokeWidth="20"
          strokeLinecap="round"
        />
        {/* Left wing — secondary feather */}
        <path
          className="tordo-wing tordo-wing-left-2"
          d="M 228 358 C 178 308 132 272 88 196"
          fill="none"
          stroke="#3db9bb"
          strokeWidth="13"
          strokeLinecap="round"
        />
        {/* Left wing — tertiary feather */}
        <path
          className="tordo-wing tordo-wing-left-3"
          d="M 205 378 C 140 328 72 290 28 208"
          fill="none"
          stroke="#3db9bb"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Right wing — primary */}
        <path
          className="tordo-wing tordo-wing-right"
          d="M 378 298 C 448 226 512 172 558 88"
          fill="none"
          stroke="#3db9bb"
          strokeWidth="20"
          strokeLinecap="round"
        />
        {/* Right wing — secondary feather */}
        <path
          className="tordo-wing tordo-wing-right-2"
          d="M 362 310 C 428 258 478 218 518 150"
          fill="none"
          stroke="#3db9bb"
          strokeWidth="13"
          strokeLinecap="round"
        />
        {/* Right wing — tertiary feather */}
        <path
          className="tordo-wing tordo-wing-right-3"
          d="M 392 288 C 462 218 524 158 568 78"
          fill="none"
          stroke="#3db9bb"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>

      {/* Bird body — tight crop so bird fills the container */}
      <svg
        viewBox="70 125 415 375"
        style={{ width: '100%', height: '100%', display: 'block' }}
        aria-label="TORDO"
        role="img"
      >
        <path fill="#102858" fillRule="evenodd" d="M302.9,421.1l19.1,48.7h-22.9c-6.4,0-12.4,3.6-14.9,9.5s-.4.9-.5,1.4h96.3c-1.5-4.4-4.3-7.4-8.5-9.2s-5.4-1.6-8.2-1.6h-18.8l-18.3-47.3-23.2-1.4Z"/>
        <path fill="#102858" fillRule="evenodd" d="M218.2,398.5l-27.3-17.4-74.6,95.5c.2,0,.4.2.5.3,21.7,7.4,40.8-.2,58-14.8,9.1-7.7,15.3-20.3,22.6-31.3,7-10.6,13.9-21.9,20.7-32.3h0Z"/>
        <path fill="#2549a8" fillRule="evenodd" d="M77.2,448.8l97-80.2,16.7,12.5c-17,21.4-32.9,45.4-50.2,60.1-10.4,8.9-22,14.1-34.2,14.7-9.3.4-18.4-.8-29.3-7.1h0Z"/>
        <path fill="#2848ad" fillRule="evenodd" d="M325.6,180.1c22.4-50.7,86-50.9,109.4-8.8l-.3,128.8c-1,11-7.2,69.5-55.4,103.6-5,3.5-23.6,15.8-50.8,20.9-32.3,6-69.3.4-107.4-24.2-14.9-9.6-32.3-19.4-48.1-32.9,0,0,144-167.8,152.6-187.4Z"/>
        <ellipse fill="#fff" cx="397.8" cy="180.1" rx="14.2" ry="13.6"/>
        <path fill="#3bb" fillRule="evenodd" d="M435,171.5l40.5,17.1-40.7,18.8.2-35.9Z"/>
        <path fill="#3db9bb" fillRule="evenodd" d="M121.6,369.4c5.8-7.5,126.7-161,193.2-151.5,27.2,3.9,39.8,19.1,39.8,19.1,15.4,18.6,11.2,43.9,10.2,50.3-5.8,35.3-36.1,64.2-67.1,77.3-18.1,7.7-28.2,6.4-133.8,5.2-18.5-.2-33.4-.4-42.4-.4Z"/>
        <path fill="#102858" fillRule="evenodd" d="M161.3,419.4s17.1-16.1,16.9-37c0-5-1.1-9.2-2.2-12.5,5,3.7,9.9,7.4,14.9,11.1-23,29.7-29.7,38.3-29.6,38.3Z"/>
      </svg>
    </div>
  );
}
