// ─── Switch3DBar Component ───────────────────────────────────────────────────
// Paste this file into your Next.js project: components/Switch3DBar.jsx
// Then add <Switch3DBar /> inside your _app.js or layout.js (see example file)

import { useState } from 'react';

export default function Switch3DBar() {
  const [hovered, setHovered] = useState(false);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');

        @keyframes switch3d-glow {
          0%, 100% { box-shadow: 0 0 18px rgba(0,245,255,0.35), inset 0 0 18px rgba(0,245,255,0.06); }
          50%       { box-shadow: 0 0 36px rgba(0,245,255,0.6),  inset 0 0 28px rgba(0,245,255,0.12); }
        }
        @keyframes switch3d-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
        @keyframes switch3d-scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>

      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        height: '48px',
        background: 'linear-gradient(90deg, rgba(0,6,14,0.97) 0%, rgba(0,15,28,0.97) 50%, rgba(0,6,14,0.97) 100%)',
        borderBottom: '1px solid rgba(0,245,255,0.2)',
        backdropFilter: 'blur(12px)',
        animation: 'switch3d-glow 3s ease-in-out infinite',
      }}>

        {/* Left scan-line shimmer */}
        <div style={{
          position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '60px',
            background: 'linear-gradient(90deg, transparent, rgba(0,245,255,0.08), transparent)',
            animation: 'switch3d-scan 3.5s linear infinite',
          }} />
        </div>

        {/* Dot indicator */}
        <span style={{
          display: 'inline-block', width: '7px', height: '7px',
          borderRadius: '50%', background: '#00f5ff',
          boxShadow: '0 0 10px #00f5ff',
          marginRight: '14px',
          animation: 'switch3d-pulse 1.4s ease-in-out infinite',
          flexShrink: 0,
        }} />

        {/* Label */}
        <span style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 'clamp(0.6rem, 2vw, 0.82rem)',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          marginRight: '20px',
          whiteSpace: 'nowrap',
        }}>
          YOU ARE IN 2D MODE
        </span>

        {/* Switch to 3D Button */}
        <a
          href="https://rivera-ten.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 22px',
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 'clamp(0.65rem, 2vw, 0.85rem)',
            fontWeight: 900,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: hovered ? '#000' : '#00f5ff',
            textDecoration: 'none',
            background: hovered
              ? 'linear-gradient(135deg, #00f5ff, #0090ff)'
              : 'linear-gradient(135deg, rgba(0,245,255,0.12), rgba(0,144,255,0.08))',
            border: '1.5px solid rgba(0,245,255,0.7)',
            borderRadius: '4px',
            transition: 'all 0.22s ease',
            boxShadow: hovered
              ? '0 0 28px rgba(0,245,255,0.7)'
              : '0 0 10px rgba(0,245,255,0.2)',
            whiteSpace: 'nowrap',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Cube icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z"
              stroke={hovered ? '#000' : '#00f5ff'} strokeWidth="1.4"
              fill={hovered ? 'rgba(0,0,0,0.15)' : 'rgba(0,245,255,0.08)'}
              style={{ transition: 'all 0.22s ease' }}
            />
            <path d="M7 1V13M1 4.5L7 8L13 4.5"
              stroke={hovered ? '#000' : '#00f5ff'} strokeWidth="1.1"
              style={{ transition: 'all 0.22s ease' }}
            />
          </svg>
          SWITCH TO 3D
          {/* Arrow */}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 8L8 2M8 2H3M8 2V7"
              stroke={hovered ? '#000' : '#00f5ff'} strokeWidth="1.5"
              strokeLinecap="round" style={{ transition: 'all 0.22s ease' }}
            />
          </svg>
        </a>

        {/* Right dot indicator */}
        <span style={{
          display: 'inline-block', width: '7px', height: '7px',
          borderRadius: '50%', background: '#00f5ff',
          boxShadow: '0 0 10px #00f5ff',
          marginLeft: '14px',
          animation: 'switch3d-pulse 1.4s ease-in-out infinite 0.7s',
          flexShrink: 0,
        }} />
      </div>

      {/* Spacer so page content doesn't hide under the bar */}
      <div style={{ height: '48px' }} />
    </>
  );
}
