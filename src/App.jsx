import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useRef, useEffect, useState, Suspense, useCallback } from 'react'
import * as THREE from 'three'

// ─── Waypoints ────────────────────────────────────────────────────────────────
const WP_NAMES = [
  'Object_7',         // view  1 — Schedule
  'Object_622',       // view  2 — Activity
  'Object_1099',      // view  3 — Sponsors
  'Object_1033',      // view  4 — Gallery
  'Object_1108',      // view  5 — Contact
  'Bus_stop001_87',   // view  6
  'Object_628',       // view  7
  'Object_13',        // view  8
  'Object_619',       // view  9
  'Object_1063',      // view 10
  'Object_1015',      // view 11
  'Object_1069',      // view 12 — About Us
  'Object_1084',      // view 13
]

const ROAD_YAWS = [
  -Math.PI / 2,   // view  1
  -Math.PI / 2,   // view  2
   0,             // view  3
  -Math.PI / 2,   // view  4
  -Math.PI / 2,   // view  5
  -Math.PI / 2,   // view  6
   Math.PI,       // view  7
   Math.PI,       // view  8
   Math.PI / 2,   // view  9
   Math.PI / 2,   // view 10
   0,             // view 11
   0,             // view 12
   0,             // view 13
]

// ─── Panel data ───────────────────────────────────────────────────────────────
const PANELS = {
  1: {
    key: 'activities',
    label: 'Curated Experiences',
    title: 'Activities',
    icon: '✨',
    accent: '#d4af37',
    content: [
      { icon: '🐪', label: 'Royal Camel Procession', desc: 'Through the illuminated dunes' },
      { icon: '🔮', label: 'Grand Vizier\'s Oracle Chamber', desc: 'Ancient wisdom revealed' },
      { icon: '💃', label: 'Belly Dance Masterclass', desc: 'With acclaimed artists' },
      { icon: '🎭', label: 'Shadow Theatre of 1001 Nights', desc: 'Immersive storytelling' },
      { icon: '🏺', label: 'The Artisan\'s Grand Souk', desc: 'Heritage pottery & crafts' },
      { icon: '🎨', label: 'Royal Henna Atelier', desc: 'Bespoke arabesque designs' },
      { icon: '🪕', label: 'Oud & Qanun Concert Hall', desc: 'Masters of classical Arabic music' },
    ],
  },
  2: {
    key: 'sponsors',
    label: 'Distinguished Patrons',
    title: 'Sponsors',
    icon: '⭐',
    accent: '#d4af37',
    content: [
      { tier: 'Platinum', color: '#e8e8ff', glow: '#b0b0ff', names: ['Al Noor Royal Group'] },
      { tier: 'Gold', color: '#d4af37', glow: '#d4af37', names: ['Desert Pearl LLC', 'Majlis Heritage'] },
      { tier: 'Silver', color: '#c8d8e8', glow: '#a0c0e0', names: ['Oasis Ventures', 'Sahara Hospitality', 'Mirage Events'] },
      { tier: 'Bronze', color: '#cd7f32', glow: '#cd7f32', names: ['Dune Crafts', 'Night Bloom Co.', 'Star Merchants', 'Crescent Media'] },
    ],
  },
  3: {
    key: 'gallery',
    label: 'Visual Chronicles',
    title: 'Gallery',
    icon: '🌟',
    accent: '#d4af37',
    content: [
      { label: 'Arabian Nights 2024', year: '2024', desc: 'A journey through the ancient desert city under a canopy of stars' },
      { label: 'The Lantern Ascension', year: '2023', desc: 'Ten thousand lanterns illuminated the night sky in unison' },
      { label: 'The Grand Souk', year: '2023', desc: 'Artisans and master traders from across the Arab world' },
      { label: 'Royal Tent Collection', year: '2022', desc: 'Majestic Bedouin décor from the Sultanate\'s own collection' },
      { label: 'Night of a Thousand Stars', year: '2022', desc: 'Celestial light installation by award-winning artists' },
    ],
  },
  11: {
    key: 'about',
    label: 'Our Legacy',
    title: 'About Us',
    icon: '👑',
    accent: '#d4af37',
    content: {
      headline: 'A Century of Arabian Excellence',
      body: 'Born from the sands of time and the dreams of visionaries, the Arabian Night Festival stands as the crown jewel of cultural celebrations across the Emirates. For over two decades we have woven together the finest traditions of the Arab world with breathtaking modern artistry — creating an experience that transcends the ordinary and ascends to the legendary.',
      pillars: [
        { icon: '✦', label: 'Est. 2003', sub: 'Two Decades of Grandeur' },
        { icon: '✦', label: '50,000+', sub: 'Royal Guests Annually' },
        { icon: '✦', label: '30+ Nations', sub: 'Cultural Representation' },
      ],
      quote: '"Where the desert meets the stars, and dreams become reality."',
    },
  },
  4: {
    key: 'contact',
    label: 'Royal Correspondence',
    title: 'Contact',
    icon: '📜',
    accent: '#d4af37',
    content: [
      { icon: '📍', label: 'Desert Pearl Royal Convention Centre', sub: 'Gate of the Seven Stars, Gate 7' },
      { icon: '📞', label: '+971 4 000 0000', sub: 'Royal Guest Relations' },
      { icon: '✉️', label: 'concierge@arabiannight.ae', sub: 'Private Enquiries' },
      { icon: '🌐', label: 'www.arabiannight.ae', sub: 'Official Portal' },
      { icon: '📸', label: '@ArabianNightFestival', sub: 'Social Presence' },
      { icon: '🕰️', label: 'Friday – Sunday', sub: '6:00 PM until Dawn' },
    ],
  },
}

// ─── Spline helpers ───────────────────────────────────────────────────────────
function catmullRomPoint(t, wps) {
  const n = wps.length, maxT = n - 1
  const c = Math.max(0, Math.min(t, maxT))
  const seg = Math.min(Math.floor(c), maxT - 1), f = c - seg
  const p0 = wps[Math.max(seg-1,0)].pos, p1 = wps[seg].pos
  const p2 = wps[Math.min(seg+1,maxT)].pos, p3 = wps[Math.min(seg+2,maxT)].pos
  const t2 = f*f, t3 = t2*f
  return new THREE.Vector3(
    .5*((2*p1.x)+(-p0.x+p2.x)*f+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    .5*((2*p1.y)+(-p0.y+p2.y)*f+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
    .5*((2*p1.z)+(-p0.z+p2.z)*f+(2*p0.z-5*p1.z+4*p2.z-p3.z)*t2+(-p0.z+3*p1.z-3*p2.z+p3.z)*t3),
  )
}
function lerpAngle(a,b,t){let d=((b-a)%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI;return a+d*t}
function catmullRomYaw(t, wps) {
  const n = wps.length, maxT = n - 1
  const c = Math.max(0, Math.min(t, maxT))
  const seg = Math.min(Math.floor(c), maxT-1), f = c-seg
  const y0=wps[Math.max(seg-1,0)].yaw,y1=wps[seg].yaw
  const y2=wps[Math.min(seg+1,maxT)].yaw,y3=wps[Math.min(seg+2,maxT)].yaw
  const d01=lerpAngle(0,y1-y0,1),d12=lerpAngle(0,y2-y1,1),d23=lerpAngle(0,y3-y2,1)
  const m1=.5*(d01+d12),m2=.5*(d12+d23),t2=f*f,t3=t2*f
  return y1+m1*f+(-3*d12+2*m1+m2)*t2+(2*d12-m1-m2)*t3
}

// ─── Scene ────────────────────────────────────────────────────────────────────
function Scene({ sharedRefs, onReady }) {
  const { camera } = useThree()
  const { scene }  = useGLTF('/futuristic_low-poly_city.glb')
  const wps        = useRef([])
  const initialized = useRef(false)

  useEffect(() => {
    scene.scale.set(5000,5000,5000)
    scene.rotation.y = Math.PI/2
    scene.updateMatrixWorld(true)
    const box0 = new THREE.Box3().setFromObject(scene)
    const center = box0.getCenter(new THREE.Vector3())
    scene.position.set(-center.x,-box0.min.y,-center.z)
    scene.updateMatrixWorld(true)
    scene.matrixAutoUpdate = false
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const eyeH = Math.max(size.x,size.y,size.z)*0.030
    sharedRefs.eyeH.current = eyeH
    const found = {}
    scene.traverse(child => {
      WP_NAMES.forEach(n => {
        if (!found[n] && child.name?.startsWith(n)) {
          const v = new THREE.Vector3()
          child.getWorldPosition(v)
          found[n] = v
        }
      })
    })
    const pts = WP_NAMES.map(n => found[n]).filter(Boolean)
    if (pts.length < 2) return
    const groundY = box.min.y + eyeH
    const built = pts.map((worldPos,i) => {
      const next=pts[i+1], prev=pts[i-1]
      let fwd = new THREE.Vector3(0,0,1)
      if (next) { fwd.subVectors(next,worldPos); fwd.y=0; fwd.normalize() }
      else if (prev) { fwd.subVectors(worldPos,prev); fwd.y=0; fwd.normalize() }
      const pos = worldPos.clone(); pos.y = groundY
      return { pos, fwd: fwd.clone(), yaw: Math.atan2(-fwd.x,-fwd.z) }
    })
    built.forEach((wp,i) => { if (i < ROAD_YAWS.length) wp.yaw = ROAD_YAWS[i] })
    wps.current = built
    sharedRefs.wpsRef.current = built
    sharedRefs.yaw.current = ROAD_YAWS[0]
    sharedRefs.pitch.current = -0.04
    camera.position.copy(built[0].pos)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = sharedRefs.yaw.current
    camera.rotation.x = sharedRefs.pitch.current
    camera.rotation.z = 0
    sharedRefs.pathT.current = 0
    sharedRefs.targetT.current = -1
    sharedRefs.autoYaw.current = false
    initialized.current = true
    onReady(built.length)
  }, [scene])

  useFrame((_,dt) => {
    if (!initialized.current || wps.current.length < 2) return
    dt = Math.min(dt, 0.05)
    const maxT = wps.current.length - 1
    if (sharedRefs.targetT.current >= 0) {
      const diff = sharedRefs.targetT.current - sharedRefs.pathT.current
      sharedRefs.pathT.current += diff * Math.min(1, 2.2*dt)
      sharedRefs.vel.current = 0
      if (Math.abs(diff) < 0.0005) {
        sharedRefs.pathT.current = sharedRefs.targetT.current
        sharedRefs.targetT.current = -1
        sharedRefs.autoYaw.current = false
      }
    } else {
      sharedRefs.pathT.current += sharedRefs.vel.current
      if (sharedRefs.pathT.current <= 0) { sharedRefs.pathT.current=0; if(sharedRefs.vel.current<0) sharedRefs.vel.current=0 }
      if (sharedRefs.pathT.current >= maxT) { sharedRefs.pathT.current=maxT; if(sharedRefs.vel.current>0) sharedRefs.vel.current=0 }
      sharedRefs.vel.current *= 0.93
      if (Math.abs(sharedRefs.vel.current) < 0.000006) sharedRefs.vel.current = 0
    }
    camera.position.copy(catmullRomPoint(sharedRefs.pathT.current, wps.current))
    if (sharedRefs.autoYaw.current) {
      const py = catmullRomYaw(sharedRefs.pathT.current, wps.current)
      sharedRefs.yaw.current = lerpAngle(sharedRefs.yaw.current, py, Math.min(1,3*dt))
    }
    const cp = Math.max(-Math.PI*.44, Math.min(Math.PI*.44, sharedRefs.pitch.current))
    camera.rotation.order = 'YXZ'
    camera.rotation.y = sharedRefs.yaw.current
    camera.rotation.x = cp
    camera.rotation.z = 0
  })

  return <primitive object={scene} />
}

// ─── Stars component ──────────────────────────────────────────────────────────
const STARS = Array.from({length: 20}, (_,i) => ({
  left: `${5 + (i*17 + i*i*3) % 88}%`,
  top: `${8 + (i*23 + i*7) % 82}%`,
  size: 2 + (i % 3),
  delay: `${(i * 0.37).toFixed(2)}s`,
  dur: `${2.5 + (i % 4) * 0.6}s`,
}))

// ─── Ultra Premium Panel ──────────────────────────────────────────────────────
function LuxuryPanel({ panelIdx, visible, scrollsLeft }) {
  const data = PANELS[panelIdx]
  if (!data) return null
  const absorbed = 3 - scrollsLeft

  const renderContent = () => {
    if (data.key === 'about') {
      const c = data.content
      return (
        <div>
          <p style={{
            color: '#f5e096', fontFamily: 'Georgia,serif', fontSize: '0.72rem',
            lineHeight: 1.85, marginBottom: '18px', fontStyle: 'italic',
            opacity: 0.9, textAlign: 'justify',
          }}>{c.body}</p>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px', marginBottom: '18px',
          }}>
            {c.pillars.map((p,i) => (
              <div key={i} style={{
                background: 'linear-gradient(160deg,rgba(212,175,55,0.1),rgba(212,175,55,0.04))',
                border: '1px solid rgba(212,175,55,0.25)',
                borderRadius: '10px', padding: '10px 6px', textAlign: 'center',
              }}>
                <div style={{ color: '#d4af37', fontSize: '0.6rem', marginBottom: '4px', animation: 'goldpulse 2s ease-in-out infinite' }}>{p.icon}</div>
                <div style={{ color: '#f5e096', fontFamily: 'Georgia,serif', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '2px' }}>{p.label}</div>
                <div style={{ color: 'rgba(245,224,150,0.55)', fontSize: '0.58rem', letterSpacing: '0.04em' }}>{p.sub}</div>
              </div>
            ))}
          </div>
          <div style={{
            borderLeft: '2px solid #d4af37', paddingLeft: '12px',
            color: 'rgba(245,224,150,0.75)', fontFamily: 'Georgia,serif',
            fontSize: '0.72rem', fontStyle: 'italic', lineHeight: 1.6,
          }}>{c.quote}</div>
        </div>
      )
    }
    if (data.key === 'activities') {
      return data.content.map((item, i) => (
        <div key={i} style={{
          display: 'flex', gap: '12px', alignItems: 'center',
          padding: '9px 12px', borderRadius: '10px', marginBottom: '5px',
          background: 'linear-gradient(90deg,rgba(212,175,55,0.07),rgba(212,175,55,0.02))',
          border: '1px solid rgba(212,175,55,0.12)',
          animation: `revealUp 0.5s ${i*0.06}s both`,
        }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,rgba(212,175,55,0.2),rgba(212,175,55,0.06))',
            border: '1px solid rgba(212,175,55,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem',
          }}>{item.icon}</div>
          <div>
            <div style={{ color: '#f5e096', fontFamily: 'Georgia,serif', fontSize: '0.76rem', fontWeight: 'bold', marginBottom: '1px' }}>{item.label}</div>
            <div style={{ color: 'rgba(245,224,150,0.5)', fontSize: '0.65rem' }}>{item.desc}</div>
          </div>
        </div>
      ))
    }
    if (data.key === 'sponsors') {
      return data.content.map((tier, i) => (
        <div key={i} style={{ marginBottom: '14px', animation: `revealUp 0.5s ${i*0.1}s both` }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px',
          }}>
            <div style={{ flex:1, height:'1px', background:`linear-gradient(90deg,transparent,${tier.color}55)` }} />
            <span style={{
              color: tier.color, fontSize: '0.6rem', letterSpacing: '0.22em',
              textTransform: 'uppercase', fontFamily: 'Georgia,serif',
              textShadow: `0 0 12px ${tier.glow}88`,
            }}>{tier.tier}</span>
            <div style={{ flex:1, height:'1px', background:`linear-gradient(90deg,${tier.color}55,transparent)` }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {tier.names.map((name, j) => (
              <span key={j} style={{
                background: `linear-gradient(135deg,${tier.color}18,${tier.color}08)`,
                border: `1px solid ${tier.color}50`,
                borderRadius: '30px', padding: '4px 13px',
                color: tier.color, fontSize: '0.72rem', fontFamily: 'Georgia,serif',
                boxShadow: `0 0 10px ${tier.glow}22`,
              }}>{name}</span>
            ))}
          </div>
        </div>
      ))
    }
    if (data.key === 'gallery') {
      return data.content.map((item, i) => (
        <div key={i} style={{
          padding: '10px 12px', borderRadius: '10px', marginBottom: '6px',
          background: 'linear-gradient(135deg,rgba(212,175,55,0.08),rgba(212,175,55,0.02))',
          border: '1px solid rgba(212,175,55,0.14)',
          animation: `revealUp 0.5s ${i*0.07}s both`,
          cursor: 'default',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px',
          }}>
            <div style={{ color: '#f5e096', fontFamily: 'Georgia,serif', fontSize: '0.78rem', fontWeight: 'bold' }}>{item.label}</div>
            <span style={{
              color: '#d4af37', fontSize: '0.58rem', letterSpacing: '0.12em',
              border: '1px solid rgba(212,175,55,0.3)', borderRadius: '20px',
              padding: '1px 7px',
            }}>{item.year}</span>
          </div>
          <div style={{ color: 'rgba(245,224,150,0.58)', fontSize: '0.68rem', lineHeight: 1.45 }}>{item.desc}</div>
        </div>
      ))
    }
    if (data.key === 'contact') {
      return data.content.map((item, i) => (
        <div key={i} style={{
          display: 'flex', gap: '12px', alignItems: 'center',
          padding: '9px 12px', borderRadius: '10px', marginBottom: '5px',
          background: 'linear-gradient(90deg,rgba(212,175,55,0.07),rgba(212,175,55,0.02))',
          border: '1px solid rgba(212,175,55,0.1)',
          animation: `revealUp 0.5s ${i*0.06}s both`,
        }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,rgba(212,175,55,0.18),rgba(212,175,55,0.05))',
            border: '1px solid rgba(212,175,55,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem',
          }}>{item.icon}</div>
          <div>
            <div style={{ color: '#f5e096', fontSize: '0.76rem', fontFamily: 'Georgia,serif', marginBottom: '1px' }}>{item.label}</div>
            <div style={{ color: 'rgba(245,224,150,0.5)', fontSize: '0.62rem' }}>{item.sub}</div>
          </div>
        </div>
      ))
    }
    return null
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: '370px',
      zIndex: 50, display: 'flex', alignItems: 'center', pointerEvents: 'none',
      transition: 'transform 0.7s cubic-bezier(0.16,1,0.3,1), opacity 0.5s ease',
      transform: visible ? 'translateX(0)' : 'translateX(390px)',
      opacity: visible ? 1 : 0,
    }}>
      <div style={{
        width: '100%', margin: '18px 14px 18px 0',
        maxHeight: 'calc(100vh - 36px)',
        background: 'linear-gradient(160deg,#080220 0%,#0f0535 40%,#070118 100%)',
        borderRadius: '18px', overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(212,175,55,0.4), 0 0 40px rgba(212,175,55,0.15), 0 0 80px rgba(130,80,200,0.1), 0 30px 80px rgba(0,0,0,0.8)',
        position: 'relative',
        animation: visible ? 'panelGlow 3s ease-in-out infinite' : 'none',
      }}>
        <div style={{
          height: '4px',
          background: 'linear-gradient(90deg,transparent 0%,#8b6914 10%,#d4af37 30%,#f5e096 50%,#d4af37 70%,#8b6914 90%,transparent 100%)',
          animation: 'shimmerBar 3s linear infinite',
          backgroundSize: '200% 100%',
        }} />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `radial-gradient(circle at 20% 20%, rgba(212,175,55,0.04) 1px, transparent 1px),
            radial-gradient(circle at 80% 80%, rgba(212,175,55,0.03) 1px, transparent 1px),
            radial-gradient(circle at 50% 50%, rgba(130,80,200,0.04) 2px, transparent 2px)`,
          backgroundSize: '40px 40px, 40px 40px, 80px 80px',
        }} />
        {STARS.map((s,i) => (
          <div key={i} style={{
            position: 'absolute', left: s.left, top: s.top, pointerEvents: 'none',
            width: `${s.size}px`, height: `${s.size}px`, borderRadius: '50%',
            background: '#d4af37', opacity: 0.4,
            animation: `twinkle ${s.dur} ${s.delay} ease-in-out infinite`,
            boxShadow: `0 0 ${s.size*2}px #d4af37`,
          }} />
        ))}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 36px - 100px)', position: 'relative', zIndex: 1 }}>
          <div style={{ padding: '20px 20px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
              <div style={{ flex:1, height:'1px', background:'linear-gradient(90deg,transparent,rgba(212,175,55,0.3))' }} />
              <span style={{ color: 'rgba(212,175,55,0.6)', fontSize: '0.52rem', letterSpacing: '0.25em', textTransform: 'uppercase', fontFamily: 'Georgia,serif' }}>✦ Arabian Night Festival ✦</span>
              <div style={{ flex:1, height:'1px', background:'linear-gradient(90deg,rgba(212,175,55,0.3),transparent)' }} />
            </div>
            <div style={{ color: 'rgba(212,175,55,0.55)', fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'Georgia,serif', marginBottom: '4px' }}>{data.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,rgba(212,175,55,0.22),rgba(212,175,55,0.05))',
                border: '1px solid rgba(212,175,55,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.3rem',
                boxShadow: '0 0 20px rgba(212,175,55,0.2)',
                animation: 'iconGlow 2.5s ease-in-out infinite',
              }}>{data.icon}</div>
              <h2 style={{
                color: '#f5e096', fontFamily: 'Georgia,serif', fontWeight: 'bold',
                fontSize: '1.6rem', margin: 0, letterSpacing: '0.04em',
                textShadow: '0 0 30px rgba(212,175,55,0.5), 0 0 60px rgba(212,175,55,0.2)',
                animation: 'titleShimmer 4s ease-in-out infinite',
              }}>{data.title}</h2>
              <div style={{ marginLeft: 'auto', fontSize: '1.4rem', opacity: 0.35, animation: 'floatCrescent 4s ease-in-out infinite' }}>☽</div>
            </div>
            <div style={{
              height: '1px', margin: '12px 0',
              background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.6),rgba(245,224,150,0.8),rgba(212,175,55,0.6),transparent)',
              boxShadow: '0 0 8px rgba(212,175,55,0.4)',
            }} />
            <div style={{ paddingBottom: '10px' }}>{renderContent()}</div>
          </div>
        </div>
        <div style={{
          padding: '12px 20px 16px',
          background: 'linear-gradient(0deg,rgba(7,1,24,0.98) 0%,rgba(7,1,24,0.7) 100%)',
          borderTop: '1px solid rgba(212,175,55,0.12)',
          position: 'relative', zIndex: 2,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ color: 'rgba(212,175,55,0.6)', fontSize: '0.58rem', letterSpacing: '0.16em', fontFamily: 'Georgia,serif' }}>
              {scrollsLeft > 0 ? `✦ ${scrollsLeft} SCROLL${scrollsLeft>1?'S':''} TO ADVANCE ✦` : '✦ SCROLL TO CONTINUE ✦'}
            </span>
            <div style={{ display:'flex', gap:'5px' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: i < absorbed ? '18px' : '8px', height:'8px', borderRadius:'99px',
                  background: i < absorbed ? 'linear-gradient(90deg,#8b6914,#d4af37,#f5e096)' : 'rgba(212,175,55,0.15)',
                  border: '1px solid rgba(212,175,55,0.3)',
                  transition: 'all 0.4s ease',
                  boxShadow: i < absorbed ? '0 0 8px rgba(212,175,55,0.5)' : 'none',
                }} />
              ))}
            </div>
          </div>
          <div style={{ height:'2px', borderRadius:'99px', background:'rgba(212,175,55,0.1)', overflow:'hidden' }}>
            <div style={{
              height:'100%', borderRadius:'99px',
              width: `${Math.min(100,(absorbed/3)*100)}%`,
              background: 'linear-gradient(90deg,#8b6914,#d4af37,#f5e096)',
              transition: 'width 0.4s ease',
              boxShadow: '0 0 10px rgba(212,175,55,0.7)',
            }} />
          </div>
        </div>
        <div style={{
          height: '4px',
          background: 'linear-gradient(90deg,transparent 0%,#8b6914 10%,#d4af37 30%,#f5e096 50%,#d4af37 70%,#8b6914 90%,transparent 100%)',
        }} />
      </div>
    </div>
  )
}

// ─── Scroll Indicator ─────────────────────────────────────────────────────────
function ScrollIndicator() {
  return (
    <div style={{
      position: 'fixed', bottom: '36px', left: '28px',
      zIndex: 60, pointerEvents: 'none',
    }}>
      <span style={{
        color: 'rgba(255,255,255,0.28)', fontSize: '0.65rem',
        fontFamily: 'Georgia,serif', letterSpacing: '0.08em',
        fontStyle: 'italic',
      }}>scroll to continue</span>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
const SCROLL_THRESHOLD = 3

export default function App() {
  const sharedRefs = useRef({
    pathT:   { current: 0 },
    targetT: { current: -1 },
    vel:     { current: 0 },
    yaw:     { current: 0 },
    pitch:   { current: -0.04 },
    eyeH:    { current: 100 },
    autoYaw: { current: false },
    wpsRef:  { current: [] },
  }).current

  const [numWps,      setNumWps]      = useState(0)
  const [ready,       setReady]       = useState(false)
  const [activePanel, setActivePanel] = useState(-1)
  const [scrollsLeft, setScrollsLeft] = useState(SCROLL_THRESHOLD)

  const scrollLock = useRef({ lockedWpIdx: -1, count: 0 })

  const getDisplayWpIdx = useCallback((t) => {
    const rounded = Math.round(t)
    if (rounded in PANELS && Math.abs(t - rounded) < 0.28) return rounded
    return -1
  }, [])

  useEffect(() => {
    let lastX = null, lastY = null
    const onMove = e => {
      if (lastX !== null) {
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY
        sharedRefs.yaw.current   -= dx * 0.0016
        sharedRefs.pitch.current -= dy * 0.0016
        sharedRefs.pitch.current  = Math.max(-1.35, Math.min(1.35, sharedRefs.pitch.current))
        sharedRefs.autoYaw.current = false
      }
      lastX = e.clientX; lastY = e.clientY
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    const dragState = { active: false, x: 0, y: 0 }
    const onTouchStart = e => {
      const t = e.touches[0]
      dragState.active = true; dragState.x = t.clientX; dragState.y = t.clientY
      sharedRefs.autoYaw.current = false
    }
    const onTouchMove = e => {
      if (!dragState.active) return
      const t = e.touches[0]
      const dx = t.clientX - dragState.x, dy = t.clientY - dragState.y
      dragState.x = t.clientX; dragState.y = t.clientY
      sharedRefs.yaw.current   -= dx * 0.0038
      sharedRefs.pitch.current -= dy * 0.0038
      sharedRefs.pitch.current  = Math.max(-1.35, Math.min(1.35, sharedRefs.pitch.current))
    }
    const onTouchEnd = () => { dragState.active = false }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  useEffect(() => {
    const onWheel = e => {
      e.preventDefault()
      const norm = e.deltaMode===1 ? 40 : e.deltaMode===2 ? 800 : 1
      const dy = e.deltaY * norm, dx = e.deltaX * norm
      const wpIdx = getDisplayWpIdx(sharedRefs.pathT.current)
      if (wpIdx >= 0) {
        const lock = scrollLock.current
        if (lock.lockedWpIdx !== wpIdx) { lock.lockedWpIdx = wpIdx; lock.count = 0 }
        if (lock.count < SCROLL_THRESHOLD) {
          lock.count += 1
          setScrollsLeft(SCROLL_THRESHOLD - lock.count)
          return
        }
      } else {
        scrollLock.current = { lockedWpIdx: -1, count: 0 }
      }
      sharedRefs.vel.current    += dy * 0.000016
      sharedRefs.targetT.current = -1
      sharedRefs.yaw.current    -= dx * 0.0022
      sharedRefs.autoYaw.current = false
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [getDisplayWpIdx])

  useEffect(() => {
    if (numWps < 2) return
    const maxT = numWps - 1
    const onKey = e => {
      let idx = -1
      if (e.key==='ArrowRight'||e.key==='ArrowDown') { e.preventDefault(); idx=Math.min(maxT,Math.floor(sharedRefs.pathT.current+1)) }
      else if (e.key==='ArrowLeft'||e.key==='ArrowUp') { e.preventDefault(); idx=Math.max(0,Math.ceil(sharedRefs.pathT.current-1)) }
      if (idx >= 0) {
        sharedRefs.targetT.current = idx
        sharedRefs.autoYaw.current = false
        const wp = sharedRefs.wpsRef.current[idx]
        if (wp) { sharedRefs.yaw.current=wp.yaw; sharedRefs.pitch.current=-0.04 }
        scrollLock.current = { lockedWpIdx:-1, count:0 }
        setScrollsLeft(SCROLL_THRESHOLD)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numWps])

  useEffect(() => {
    const id = setInterval(() => {
      const t = sharedRefs.pathT.current
      const wpIdx = getDisplayWpIdx(t)
      setActivePanel(wpIdx)
      if (wpIdx < 0) {
        scrollLock.current = { lockedWpIdx:-1, count:0 }
        setScrollsLeft(SCROLL_THRESHOLD)
      } else if (scrollLock.current.lockedWpIdx !== wpIdx) {
        setScrollsLeft(SCROLL_THRESHOLD)
      } else {
        setScrollsLeft(Math.max(0, SCROLL_THRESHOLD - scrollLock.current.count))
      }
    }, 80)
    return () => clearInterval(id)
  }, [getDisplayWpIdx])

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; cursor: none; }
        @keyframes shimmerBar {
          0% { background-position: -100% 0 }
          100% { background-position: 200% 0 }
        }
        @keyframes shimmerText {
          0% { background-position: 0% 50% }
          100% { background-position: 200% 50% }
        }
        @keyframes titleShimmer {
          0%,100% { text-shadow: 0 0 30px rgba(212,175,55,0.5),0 0 60px rgba(212,175,55,0.2) }
          50% { text-shadow: 0 0 50px rgba(212,175,55,0.8),0 0 100px rgba(212,175,55,0.4) }
        }
        @keyframes panelGlow {
          0%,100% { box-shadow: 0 0 0 1px rgba(212,175,55,0.4),0 0 40px rgba(212,175,55,0.15),0 0 80px rgba(130,80,200,0.1),0 30px 80px rgba(0,0,0,0.8) }
          50% { box-shadow: 0 0 0 1px rgba(212,175,55,0.6),0 0 60px rgba(212,175,55,0.25),0 0 120px rgba(130,80,200,0.15),0 30px 80px rgba(0,0,0,0.8) }
        }
        @keyframes twinkle {
          0%,100% { opacity: 0.15; transform: scale(1) }
          50% { opacity: 0.7; transform: scale(1.5) }
        }
        @keyframes floatCrescent {
          0%,100% { transform: translateY(0) rotate(-5deg); opacity: 0.35 }
          50% { transform: translateY(-4px) rotate(5deg); opacity: 0.55 }
        }
        @keyframes iconGlow {
          0%,100% { box-shadow: 0 0 20px rgba(212,175,55,0.2) }
          50% { box-shadow: 0 0 35px rgba(212,175,55,0.4) }
        }
        @keyframes goldpulse {
          0%,100% { opacity: 0.7 }
          50% { opacity: 1 }
        }
        @keyframes revealUp {
          from { opacity: 0; transform: translateY(12px) }
          to { opacity: 1; transform: translateY(0) }
        }
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.25); border-radius: 4px }
        ::-webkit-scrollbar-track { background: transparent }
      `}</style>

      <div style={{ width:'100vw', height:'100vh', overflow:'hidden', background:'#87CEEB' }}>
        <Canvas
          camera={{ fov:65, near:1, far:9000000 }}
          gl={{ antialias:true }}
          style={{ width:'100%', height:'100%' }}
          onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace }}
        >
          <color attach="background" args={['#87CEEB']} />
          <ambientLight intensity={1.4} />
          <directionalLight position={[2000,5000,3000]} intensity={1.8} />
          <hemisphereLight args={['#c8e8ff','#4a6030',0.55]} />
          <Suspense fallback={null}>
            <Scene sharedRefs={sharedRefs} onReady={n => { setNumWps(n); setReady(true) }} />
          </Suspense>
        </Canvas>

        {ready && <LuxuryPanel panelIdx={activePanel} visible={activePanel >= 0} scrollsLeft={scrollsLeft} />}
        {ready && <ScrollIndicator />}
      </div>
    </>
  )
}
