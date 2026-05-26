// Inlined from Logo.svg (32×32 viewBox)
function SeaLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#logo-clip)">
        <path
          d="M31.715 19.0252C30.3003 26.4339 23.7874 32.0335 15.9665 32.0335C12.3069 32.0335 8.93368 30.8074 6.23517 28.7437H9.47469C12.969 28.7437 16.3164 27.3378 18.7629 24.8428L23.6667 19.8417C24.1787 19.3195 24.8793 19.0252 25.6107 19.0252H31.715ZM31.7948 13.4286C31.9298 14.2659 32 15.1248 32 16H25.6107C24.0667 16.0001 22.5877 16.6212 21.5067 17.7237L16.6028 22.7248C14.7253 24.6396 12.1564 25.7185 9.47469 25.7185H3.21308C2.60162 24.9173 2.06392 24.0568 1.61016 23.1471H8.14659C10.9908 23.1471 13.7154 22.0028 15.7068 19.9719L21.1443 14.4265C21.7701 13.7883 22.6264 13.4286 23.5203 13.4286H31.7948ZM29.7663 7.83204C30.2489 8.6456 30.6616 9.50549 30.9961 10.4035H23.5203C21.8138 10.4035 20.179 11.09 18.9842 12.3085L13.5467 17.8539C12.1243 19.3045 10.1782 20.1219 8.14659 20.1219H0.467811C0.246988 19.2894 0.0914383 18.4303 0.00701643 17.5505H6.95911C8.99069 17.5505 10.9369 16.7331 12.3593 15.2825L17.9747 9.55564C19.0557 8.45321 20.5348 7.83204 22.0788 7.83204H29.7663ZM15.9665 -0.0334473C20.4669 -0.0334473 24.5342 1.82075 27.4463 4.80685H22.0788C19.7222 4.80685 17.4646 5.75497 15.8147 7.43764L10.1992 13.1645C9.34581 14.0348 8.17806 14.5253 6.95911 14.5253H0C0.744494 6.3615 7.60866 -0.0334473 15.9665 -0.0334473Z"
          fill="white"
        />
      </g>
      <defs>
        <clipPath id="logo-clip">
          <rect width="32" height="32" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

const FONT = "'Saans', system-ui, sans-serif";

interface CanvasHeaderProps {
  teamName?: string;
  projectName?: string;
}

export function CanvasHeader({
  teamName = 'TheSEA Team',
  projectName = 'La Plage 2026',
}: CanvasHeaderProps) {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 16px',
        width: '100%',
        height: '56px',
        flexShrink: 0,
        background: '#131316',
        borderBottom: '1px solid #2F2F37',
        position: 'relative',
        zIndex: 20,
      }}
    >
      {/* Left: logo + breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <SeaLogo />

        <span
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.65)',
            fontFamily: FONT,
            fontWeight: 400,
          }}
        >
          {teamName}
        </span>

        {/* Vertical separator */}
        <span
          style={{
            display: 'inline-block',
            width: '1px',
            height: '14px',
            background: 'rgba(255,255,255,0.15)',
            flexShrink: 0,
          }}
        />

        <span
          style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.85)',
            fontFamily: FONT,
            fontWeight: 400,
          }}
        >
          {projectName}
        </span>
      </div>

      {/* Right: placeholder for future actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} />
    </div>
  );
}
