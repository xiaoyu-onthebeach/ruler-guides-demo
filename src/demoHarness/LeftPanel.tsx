import React from 'react';

function IconPlus() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12.4684 6.37573H11.5309C11.4476 6.37573 11.4059 6.4174 11.4059 6.50073V11.407H6.75C6.66667 11.407 6.625 11.4486 6.625 11.532V12.4695C6.625 12.5528 6.66667 12.5945 6.75 12.5945H11.4059V17.5007C11.4059 17.5841 11.4476 17.6257 11.5309 17.6257H12.4684C12.5517 17.6257 12.5934 17.5841 12.5934 17.5007V12.5945H17.25C17.3333 12.5945 17.375 12.5528 17.375 12.4695V11.532C17.375 11.4486 17.3333 11.407 17.25 11.407H12.5934V6.50073C12.5934 6.4174 12.5517 6.37573 12.4684 6.37573Z"
        fill="white"
        fillOpacity="0.45"
      />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10.375 10.9067H17.875C17.9438 10.9067 18 10.8505 18 10.7817V9.90674C18 9.83799 17.9438 9.78174 17.875 9.78174H10.375C10.3063 9.78174 10.25 9.83799 10.25 9.90674V10.7817C10.25 10.8505 10.3063 10.9067 10.375 10.9067ZM10.25 14.0942C10.25 14.163 10.3063 14.2192 10.375 14.2192H17.875C17.9438 14.2192 18 14.163 18 14.0942V13.2192C18 13.1505 17.9438 13.0942 17.875 13.0942H10.375C10.3063 13.0942 10.25 13.1505 10.25 13.2192V14.0942ZM18.125 6.50049H5.875C5.80625 6.50049 5.75 6.55674 5.75 6.62549V7.50049C5.75 7.56924 5.80625 7.62549 5.875 7.62549H18.125C18.1938 7.62549 18.25 7.56924 18.25 7.50049V6.62549C18.25 6.55674 18.1938 6.50049 18.125 6.50049ZM18.125 16.3755H5.875C5.80625 16.3755 5.75 16.4317 5.75 16.5005V17.3755C5.75 17.4442 5.80625 17.5005 5.875 17.5005H18.125C18.1938 17.5005 18.25 17.4442 18.25 17.3755V16.5005C18.25 16.4317 18.1938 16.3755 18.125 16.3755ZM6.225 14.0333L8.66719 12.1099C8.68363 12.0969 8.69692 12.0804 8.70607 12.0616C8.71521 12.0428 8.71996 12.0222 8.71996 12.0013C8.71996 11.9804 8.71521 11.9597 8.70607 11.9409C8.69692 11.9221 8.68363 11.9056 8.66719 11.8927L6.225 9.96768C6.13437 9.8958 6 9.95986 6 10.0755V13.9239C5.99999 13.95 6.00733 13.9756 6.02117 13.9977C6.03501 14.0198 6.05479 14.0376 6.07827 14.049C6.10174 14.0604 6.12794 14.065 6.15389 14.0622C6.17984 14.0595 6.20448 14.0494 6.225 14.0333Z"
        fill="white"
        fillOpacity="0.45"
      />
    </svg>
  );
}

function PanelIcon({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        transition: 'background 120ms',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

export function LeftPanel() {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        width: 88,
        height: '100%',
        overflowY: 'auto',
        background: '#131316',
        borderRight: '1px solid #2F2F37',
        flexShrink: 0,
      }}
    >
      {/* Icon column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '24px 16px 24px 16px',
          gap: 0,
        }}
      >
        <PanelIcon><IconPlus /></PanelIcon>
        <PanelIcon><IconLayers /></PanelIcon>
      </div>
    </div>
  );
}
