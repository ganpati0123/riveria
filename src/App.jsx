import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useRef, useEffect, useState, Suspense } from 'react'
import * as THREE from 'three'

const WP_NAMES = [
  'Object_7',
  'Object_622',
  'Object_1099',
  'Object_1033',
  'Object_1108',
]

function pathPosition(t, wps) {
  const maxT = wps.length - 1
  const c = Math.max(0, Math.min(t, maxT))
  const seg = Math.min(Math.floor(c), maxT - 1)
  const f = c - seg
  return new THREE.Vector3().lerpVectors(wps[seg].pos, wps[Math.min(seg + 1, maxT)].pos, f)
}

function Scene({ sharedRefs, onReady }) {
  const { camera } = useThree()
  const { scene }  = useGLTF('/futuristic_low-poly_city.glb')
  const wps        = useRef([])
  const initialized = useRef(false)

  useEffect(() => {
    scene.scale.set(5000, 5000, 5000)
    scene.rotation.y = Math.PI / 2
    scene.updateMatrixWorld(true)
    const box0   = new THREE.Box3().setFromObject(scene)
    const center = box0.getCenter(new THREE.Vector3())
    scene.position.set(-center.x, -box0.min.y, -center.z)
    scene.updateMatrixWorld(true)
    scene.matrixAutoUpdate = false

    const box  = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const md   = Math.max(size.x, size.y, size.z)
    const eyeH = md * 0.028
    sharedRefs.eyeH.current = eyeH

    const found = {}
    scene.traverse(child => {
      WP_NAMES.forEach(n => {
        if (!found[n] && child.name?.startsWith(n)) {
          const v = new THREE.Vector3()
          child.getWorldPosition(v)
          found[n] = v
          console.log(`✓ ${n}: [${v.toArray().map(x => x.toFixed(0)).join(', ')}]`)
        }
      })
    })
    WP_NAMES.forEach(n => { if (!found[n]) console.warn(`✗ NOT FOUND: ${n}`) })

    const pts = WP_NAMES.map(n => found[n]).filter(Boolean)
    if (pts.length < 2) { console.error('Not enough waypoints found'); return }

    const groundY = box.min.y + eyeH

    const built = pts.map((worldPos, i) => {
      const next = pts[i + 1]
      const prev = pts[i - 1]

      let fwd = new THREE.Vector3(0, 0, 1)
      if (next) { fwd.subVectors(next, worldPos); fwd.y = 0; fwd.normalize() }
      else if (prev) { fwd.subVectors(worldPos, prev); fwd.y = 0; fwd.normalize() }

      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()

      const pos = worldPos.clone()
      pos.y = groundY

      return { pos, fwd: fwd.clone() }
    })
    wps.current = built

    if (built.length >= 2) {
      const dir = built[1].pos.clone().sub(built[0].pos)
      dir.y = 0
      dir.normalize()
      sharedRefs.yaw.current   = Math.atan2(-dir.x, -dir.z)
      sharedRefs.pitch.current = -0.06
    }

    camera.position.copy(built[0].pos)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = sharedRefs.yaw.current
    camera.rotation.x = sharedRefs.pitch.current
    camera.rotation.z = 0

    sharedRefs.pathT.current   = 0
    sharedRefs.targetT.current = -1
    initialized.current = true

    onReady(built.length)
  }, [scene])

  useFrame((_, dt) => {
    if (!initialized.current || wps.current.length < 2) return
    dt = Math.min(dt, 0.05)

    const maxT = wps.current.length - 1

    if (sharedRefs.targetT.current >= 0) {
      const diff = sharedRefs.targetT.current - sharedRefs.pathT.current
      sharedRefs.pathT.current += diff * Math.min(1, 5 * dt)
      sharedRefs.vel.current    = 0
      if (Math.abs(diff) < 0.001) sharedRefs.targetT.current = -1
    } else {
      sharedRefs.pathT.current += sharedRefs.vel.current
      if (sharedRefs.pathT.current <= 0) {
        sharedRefs.pathT.current = 0
        if (sharedRefs.vel.current < 0) sharedRefs.vel.current = 0
      }
      if (sharedRefs.pathT.current >= maxT) {
        sharedRefs.pathT.current = maxT
        if (sharedRefs.vel.current > 0) sharedRefs.vel.current = 0
      }
      sharedRefs.vel.current *= 0.92
      if (Math.abs(sharedRefs.vel.current) < 0.00001) sharedRefs.vel.current = 0
    }

    const pos = pathPosition(sharedRefs.pathT.current, wps.current)
    camera.position.copy(pos)

    const clampedPitch = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, sharedRefs.pitch.current))
    camera.rotation.order = 'YXZ'
    camera.rotation.y = sharedRefs.yaw.current
    camera.rotation.x = clampedPitch
    camera.rotation.z = 0
  })

  return <primitive object={scene} />
}

function HubMenu({ onSchedule }) {
  const items = [
    { id: 'schedule', label: 'SCHEDULE', icon: '📅', sub: 'Events & Timeline', color: '#2196f3' },
    { id: 'activity', label: 'ACTIVITY', icon: '⚡', sub: 'Urban Experiences', color: '#9c27b0' },
    { id: 'gallery',  label: 'GALLERY',  icon: '🏙️', sub: 'City Photography',  color: '#00796b' },
  ]
  return (
    <div style={{ position: 'fixed', bottom: '8%', left: 0, right: 0, zIndex: 30,
      display: 'flex', justifyContent: 'center', gap: '22px', padding: '0 24px',
      animation: 'slideUp 0.55s cubic-bezier(0.22,1,0.36,1)' }}>
      {items.map((item, i) => (
        <div key={item.id}
          onClick={() => item.id === 'schedule' && onSchedule()}
          style={{ cursor: 'pointer', textAlign: 'center', padding: '22px 30px',
            background: 'rgba(4,12,30,0.84)',
            border: `1px solid ${item.color}44`,
            borderRadius: '18px', backdropFilter: 'blur(20px)',
            boxShadow: `0 6px 36px ${item.color}28`,
            minWidth: '148px', userSelect: 'none',
            transition: 'transform 0.18s, box-shadow 0.18s',
            animationDelay: `${i * 0.07}s` }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-7px) scale(1.04)'
            e.currentTarget.style.boxShadow = `0 16px 48px ${item.color}55`
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = ''
            e.currentTarget.style.boxShadow = `0 6px 36px ${item.color}28`
          }}
        >
          <div style={{ fontSize: '2.2rem', marginBottom: '9px' }}>{item.icon}</div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.88rem',
            fontFamily: 'sans-serif', letterSpacing: '0.14em' }}>{item.label}</div>
          <div style={{ color: '#8bb', fontSize: '0.72rem', marginTop: '4px', fontFamily: 'sans-serif' }}>{item.sub}</div>
          <div style={{ marginTop: '12px', height: '2px',
            background: `linear-gradient(90deg,transparent,${item.color},transparent)` }} />
        </div>
      ))}
    </div>
  )
}

function SchedulePanel() {
  const events = [
    { time: '09:00', title: 'City Council Opening',   loc: 'Central Plaza',    tag: 'Civic',     tc: '#2196f3' },
    { time: '10:30', title: 'Tech Innovation Summit', loc: 'Innovation Tower', tag: 'Tech',      tc: '#9c27b0' },
    { time: '12:00', title: 'Street Food Festival',   loc: 'Neon Market',      tag: 'Food',      tc: '#e65100' },
    { time: '14:00', title: 'Urban Art Walk',         loc: 'Gallery District', tag: 'Culture',   tc: '#00796b' },
    { time: '16:00', title: 'EV Showcase',            loc: 'Bridge Crossing',  tag: 'Transport', tc: '#0097a7' },
    { time: '19:00', title: 'Holographic Light Show', loc: 'City Skyline',     tag: 'Event',     tc: '#f50057' },
  ]
  return (
    <div style={{ position: 'fixed', top: '50%', right: '2.5%',
      transform: 'translateY(-50%)', zIndex: 30, width: '292px',
      maxHeight: '78vh', overflowY: 'auto',
      background: 'rgba(4,12,30,0.88)',
      border: '1px solid rgba(80,160,255,0.2)',
      borderRadius: '20px', backdropFilter: 'blur(22px)',
      boxShadow: '0 10px 60px rgba(0,0,0,0.75)', padding: '22px 18px',
      animation: 'slideIn 0.5s cubic-bezier(0.22,1,0.36,1)' }}>
      <div style={{ color: '#6af', fontFamily: 'sans-serif', fontSize: '0.68rem',
        letterSpacing: '0.24em', marginBottom: '3px' }}>TODAY'S</div>
      <div style={{ color: '#fff', fontFamily: 'sans-serif', fontSize: '1.25rem',
        fontWeight: 900, letterSpacing: '0.08em', marginBottom: '18px' }}>CITY SCHEDULE</div>
      {events.map((ev, i) => (
        <div key={i} style={{ display: 'flex', gap: '11px', marginBottom: '10px',
          padding: '10px 11px', background: 'rgba(255,255,255,0.038)',
          borderRadius: '11px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ color: '#6af', fontFamily: 'monospace', fontSize: '0.78rem',
            fontWeight: 700, flexShrink: 0, paddingTop: '2px' }}>{ev.time}</div>
          <div>
            <div style={{ color: '#f0f4ff', fontFamily: 'sans-serif',
              fontSize: '0.83rem', fontWeight: 600, lineHeight: 1.3 }}>{ev.title}</div>
            <div style={{ color: '#7aa', fontFamily: 'sans-serif',
              fontSize: '0.68rem', marginTop: '3px' }}>📍 {ev.loc}</div>
            <span style={{ display: 'inline-block', marginTop: '5px', padding: '2px 7px',
              background: ev.tc + '28', color: ev.tc, fontSize: '0.6rem',
              fontFamily: 'sans-serif', borderRadius: '20px',
              border: `1px solid ${ev.tc}44`, fontWeight: 800 }}>{ev.tag}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const sharedRefs = useRef({
    pathT:   { current: 0 },
    targetT: { current: -1 },
    vel:     { current: 0 },
    yaw:     { current: 0 },
    pitch:   { current: -0.06 },
    eyeH:    { current: 100 },
  }).current

  const [numWps, setNumWps]       = useState(0)
  const [showHub, setShowHub]     = useState(false)
  const [showSched, setShowSched] = useState(false)
  const [ready, setReady]         = useState(false)

  const dragState = useRef({ active: false, x: 0, y: 0 })

  useEffect(() => {
    const onWheel = e => {
      e.preventDefault()
      const norm = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1
      const dy = e.deltaY * norm
      const dx = e.deltaX * norm
      sharedRefs.vel.current    += dy * 0.00012
      sharedRefs.targetT.current = -1
      sharedRefs.yaw.current    -= dx * 0.0022
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [numWps])

  useEffect(() => {
    const sens = 0.0038
    const onDown = e => { dragState.current = { active: true, x: e.clientX, y: e.clientY } }
    const onMove = e => {
      if (!dragState.current.active) return
      const dx = e.clientX - dragState.current.x
      const dy = e.clientY - dragState.current.y
      dragState.current.x = e.clientX
      dragState.current.y = e.clientY
      sharedRefs.yaw.current   -= dx * sens
      sharedRefs.pitch.current -= dy * sens
      sharedRefs.pitch.current  = Math.max(-1.35, Math.min(1.35, sharedRefs.pitch.current))
    }
    const onUp = () => { dragState.current.active = false }
    const onTouchStart = e => {
      const t = e.touches[0]
      dragState.current = { active: true, x: t.clientX, y: t.clientY }
    }
    const onTouchMove = e => {
      if (!dragState.current.active) return
      const t = e.touches[0]
      const dx = t.clientX - dragState.current.x
      const dy = t.clientY - dragState.current.y
      dragState.current.x = t.clientX
      dragState.current.y = t.clientY
      sharedRefs.yaw.current   -= dx * sens
      sharedRefs.pitch.current -= dy * sens
      sharedRefs.pitch.current  = Math.max(-1.35, Math.min(1.35, sharedRefs.pitch.current))
    }
    const onTouchEnd = () => { dragState.current.active = false }

    window.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove,  { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      const t = sharedRefs.pathT.current
      setShowHub(t >= 0.70 && t <= 1.85)
      setShowSched(t >= 1.75)
    }, 80)
    return () => clearInterval(id)
  }, [])

  const handleScheduleClick = () => {
    sharedRefs.targetT.current = 2.0
  }

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(36px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(32px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
      `}</style>

      {!ready && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#060e1e' }} />
      )}

      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden',
        background: '#87CEEB', cursor: 'grab' }}>
        <Canvas
          camera={{ fov: 18, near: 1, far: 9000000 }}
          gl={{ antialias: true }}
          style={{ width: '100%', height: '100%' }}
          onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace }}
        >
          <color attach="background" args={['#87CEEB']} />
          <ambientLight intensity={1.4} />
          <directionalLight position={[2000, 5000, 3000]} intensity={1.8} />
          <hemisphereLight args={['#c8e8ff', '#4a6030', 0.55]} />
          <Suspense fallback={null}>
            <Scene
              sharedRefs={sharedRefs}
              onReady={n => { setNumWps(n); setReady(true) }}
            />
          </Suspense>
        </Canvas>

        {ready && showHub && !showSched && (
          <HubMenu onSchedule={handleScheduleClick} />
        )}

        {ready && showSched && (
          <SchedulePanel />
        )}
      </div>
    </>
  )
}
