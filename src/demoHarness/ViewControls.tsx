import { useState } from 'react';

const FONT = "'Saans', system-ui, sans-serif";

function FitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 5.5V1.5H5.5M10.5 1.5H14.5V5.5M14.5 10.5V14.5H10.5M5.5 14.5H1.5V10.5"
        stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ruler-on 16.svg
function RulerOnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#ron-clip)">
        <path fillRule="evenodd" clipRule="evenodd" d="M15.4134 4.11088C16.1945 4.89193 16.1945 6.15826 15.4134 6.93931L6.92815 15.4246C6.1471 16.2056 4.88077 16.2056 4.09972 15.4246L0.564189 11.8891C-0.216859 11.108 -0.216859 9.84168 0.564189 9.06063L9.04947 0.575346C9.83052 -0.205702 11.0968 -0.205702 11.8779 0.575346L15.4134 4.11088ZM11.1708 1.98956C10.7803 1.59904 10.1471 1.59904 9.75658 1.98956L9.04947 2.69667L10.8172 4.46443L9.75658 5.52509L7.98881 3.75733L6.39782 5.34832L9.5798 8.5303L8.51914 9.59096L5.33716 6.40898L3.74617 7.99997L5.51394 9.76773L4.45328 10.8284L2.68551 9.06063L1.9784 9.76773C1.58788 10.1583 1.58788 10.7914 1.9784 11.1819L4.80683 14.0104C5.19735 14.4009 5.83052 14.4009 6.22104 14.0104L13.9992 6.2322C14.3897 5.84168 14.3897 5.20851 13.9992 4.81799L11.1708 1.98956Z" fill="white"/>
      </g>
      <defs>
        <clipPath id="ron-clip"><rect width="16" height="16" fill="white"/></clipPath>
      </defs>
    </svg>
  );
}

// ruler-off 16.svg
function RulerOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#roff-clip)">
        <path d="M15.4134 6.93931C16.1945 6.15826 16.1945 4.89193 15.4134 4.11088L11.8779 0.575346C11.0968 -0.205702 9.83052 -0.205702 9.04947 0.575346L6.12482 3.5L7.19332 4.55282L7.98881 3.75733L9.75658 5.52509L10.8172 4.46443L9.04947 2.69667L9.75658 1.98956C10.1471 1.59904 10.7803 1.59904 11.1708 1.98956L13.9992 4.81799C14.3897 5.20851 14.3897 5.84168 13.9992 6.2322L6.22104 14.0104C5.83052 14.4009 5.19735 14.4009 4.80683 14.0104L1.9784 11.1819C1.58788 10.7914 1.58788 10.1583 1.9784 9.76773L2.68551 9.06063L4.45328 10.8284L5.51394 9.76773L3.74617 7.99997L5.33716 6.40898L4.2765 5.34832L0.564189 9.06063C-0.216859 9.84168 -0.216859 11.108 0.564189 11.8891L4.09972 15.4246C4.88077 16.2056 6.1471 16.2056 6.92815 15.4246L15.4134 6.93931Z" fill="white"/>
        <path d="M2.29999 2.39999L13.6137 13.7137" stroke="white" strokeWidth="1.5" strokeLinecap="square"/>
      </g>
      <defs>
        <clipPath id="roff-clip"><rect width="16" height="16" fill="white"/></clipPath>
      </defs>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 4.5L6 7.5L9 4.5" stroke="white" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

interface ViewControlsProps {
  zoom: number;
  rulersVisible: boolean;
  onFitToScreen: () => void;
  onToggleRulers: () => void;
}

export function ViewControls({
  zoom,
  rulersVisible,
  onFitToScreen,
  onToggleRulers,
}: ViewControlsProps) {
  const [rulerHovered, setRulerHovered] = useState(false);
  const [fitHovered, setFitHovered]     = useState(false);

  // Background: blue when on, subtle when hovered+off, transparent otherwise
  const rulerBg = rulersVisible
    ? '#4570FF'
    : rulerHovered
      ? 'rgba(255,255,255,0.08)'
      : 'transparent';

  // Icon opacity: full when on or hovered, dimmed when off+idle
  const iconOpacity = rulersVisible || rulerHovered ? 1 : 0.45;

  return (
    // position: fixed escapes the overflow:hidden canvas container so the tooltip
    // can render above the right panel. right: 80 = 56px panel + 24px offset.
    <div style={{ position: 'fixed', bottom: 24, right: 80, zIndex: 20, userSelect: 'none' }}>

      {/* Main pill */}
      <div
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '8px 8px 8px 16px',
          gap: 8,
          height: 48,
          background: '#131316',
          border: '1px solid #26262C',
          borderRadius: 32,
        }}
      >
        {/* Zoom label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{
            fontSize: 13,
            fontFamily: FONT,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.8)',
            whiteSpace: 'nowrap',
          }}>
            {zoom}%
          </span>
          <ChevronIcon />
        </div>

        {/* Fit to screen */}
        <div
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: fitHovered ? 'rgba(255,255,255,0.08)' : 'transparent',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            opacity: fitHovered ? 1 : 0.45,
            transition: 'background 220ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={() => setFitHovered(true)}
          onMouseLeave={() => setFitHovered(false)}
          onClick={onFitToScreen}
        >
          <FitIcon />
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 32, background: '#2F2F37', flexShrink: 0 }} />

        {/* Ruler toggle — tooltip anchored here */}
        <div style={{ position: 'relative', flexShrink: 0 }}>

          {/* Tooltip */}
          {rulerHovered && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 4px)',
                left: '50%',
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {/* Body */}
              <div
                style={{
                  background: '#50505D',
                  borderRadius: 6,
                  padding: '4px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    fontFamily: FONT,
                    fontWeight: 400,
                    fontSize: 14,
                    lineHeight: '140%',
                    letterSpacing: '-0.01em',
                    color: '#ffffff',
                    display: 'block',
                  }}
                >
                  {rulersVisible ? 'Hide rulers & guides' : 'Show rulers & guides'}
                </span>
              </div>
              {/* Arrow pointing down */}
              <div
                style={{
                  width: 16,
                  height: 8,
                  background: '#50505D',
                  clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)',
                  flexShrink: 0,
                }}
              />
            </div>
          )}

          {/* Button */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: rulerBg,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: iconOpacity,
              transition: 'background 220ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={() => setRulerHovered(true)}
            onMouseLeave={() => setRulerHovered(false)}
            onClick={onToggleRulers}
          >
            {rulersVisible ? <RulerOnIcon /> : <RulerOffIcon />}
          </div>
        </div>
      </div>
    </div>
  );
}
