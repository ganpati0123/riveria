import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useRef, useEffect, useState, Suspense, useCallback } from 'react'
import * as THREE from 'three'

// ─── Waypoints: views 1-12 ───────────────────────────────────────────────────
const WP_NAMES = [
  'Object_7',      // view  1 — A_main_road_1
  'Object_622',    // view  2 — Main_road_crossroads003
  'Object_1099',   // view  3 — Secondary_Road019_729
  'Object_1033',   // view  4 — Secondary_Road_Crossroads
  'Object_1108',   // view  5 — Secondary_Road023_735
  'Object_628',    // view  6 — Main_road_crossroads005
  'Object_13',     // view  7 — A_main_road002_5
  'Object_619',    // view  8 — Main_road_crossroads002
  'Object_1063',   // view  9 — Secondary_Road007_705
  'Object_1015',   // view 10 — Secondary_Road_Crossroads
  'Object_1069',   // view 11 — Secondary_Road009_709
  'Object_1084',   // view 12 — Secondary_Road014_719
]

// ─── Hard-coded road-facing yaws ─────────────────────────────────────────────
// Compass → Three.js world axis (scene rotation.y = π/2):
//   NORTH = +X world → yaw = -π/2
//   SOUTH = -X world → yaw = +π/2
//   EAST  = +Z world → yaw =  π
//   WEST  = -Z world → yaw =  0
const ROAD_YAWS = [
  -Math.PI / 2,   // view  1 — Object_7    — NORTH
  -Math.PI / 2,   // view  2 — Object_622  — NORTH
   0,             // view  3 — Object_1099 — WEST
  -Math.PI / 2,   // view  4 — Object_1033 — NORTH
  -Math.PI / 2,   // view  5 — Object_1108 — NORTH
   Math.PI,       // view  6 — Object_628  — EAST
   Math.PI,       // view  7 — Object_13   — EAST
   Math.PI / 2,   // view  8 — Object_619  — SOUTH
   Math.PI / 2,   // view  9 — Object_1063 — SOUTH
   0,             // view 10 — Object_1015 — WEST
   0,             // view 11 — Object_1069 — WEST
   0,             // view 12 — Object_1084 — WEST
]

// ─── Catmull-Rom spline ───────────────────────────────────────────────────────
function catmullRomPoint(t, wps) {
  const n    = wps.length
  const maxT = n - 1
  const c    = Math.max(0, Math.min(t, maxT))
  const seg  = Math.min(Math.floor(c), maxT - 1)
  const f    = c - seg

  const p0 = wps[Math.max(seg - 1, 0)].pos
  const p1 = wps[seg].pos
  const p2 = wps[Math.min(seg + 1, maxT)].pos
  const p3 = wps[Math.min(seg + 2, maxT)].pos

  const t2 = f * f
  const t3 = t2 * f

  return new THREE.Vector3(
    0.5 * ((2*p1.x) + (-p0.x+p2.x)*f + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    0.5 * ((2*p1.y) + (-p0.y+p2.y)*f + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
    0.5 * ((2*p1.z) + (-p0.z+p2.z)*f + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3),
  )
}

function lerpAngle(a, b, t) {
  let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI
  return a + d * t
}

function catmullRomYaw(t, wps) {
  const n    = wps.length
  const maxT = n - 1
  const c    = Math.max(0, Math.min(t, maxT))
  const seg  = Math.min(Math.floor(c), maxT - 1)
  const f    = c - seg

  const y0 = wps[Math.max(seg - 1, 0)].yaw
  const y1 = wps[seg].yaw
  const y2 = wps[Math.min(seg + 1, maxT)].yaw
  const y3 = wps[Math.min(seg + 2, maxT)].yaw

  const d01 = lerpAngle(0, y1 - y0, 1)
  const d12 = lerpAngle(0, y2 - y1, 1)
  const d23 = lerpAngle(0, y3 - y2, 1)
  const m1  = 0.5 * (d01 + d12)
  const m2  = 0.5 * (d12 + d23)
  const t2  = f * f
  const t3  = t2 * f
  return y1 + m1 * f + (-3*d12 + 2*m1 + m2) * t2 + (2*d12 - m1 - m2) * t3
}

// ─── Scene ────────────────────────────────────────────────────────────────────
function Scene({ sharedRefs, onReady }) {
  const { camera }  = useThree()
  const { scene }   = useGLTF('/futuristic_low-poly_city.glb')
  const wps         = useRef([])
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
    const eyeH = md * 0.030
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
      if (next)      { fwd.subVectors(next, worldPos); fwd.y = 0; fwd.normalize() }
      else if (prev) { fwd.subVectors(worldPos, prev); fwd.y = 0; fwd.normalize() }

      const pos = worldPos.clone()
      pos.y = groundY

      const yaw = Math.atan2(-fwd.x, -fwd.z)
      return { pos, fwd: fwd.clone(), yaw }
    })

    built.forEach((wp, i) => {
      if (i < ROAD_YAWS.length) wp.yaw = ROAD_YAWS[i]
    })

    wps.current = built
    sharedRefs.wpsRef.current = built

    sharedRefs.yaw.current   = ROAD_YAWS[0]
    sharedRefs.pitch.current = -0.04

    camera.position.copy(built[0].pos)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = sharedRefs.yaw.current
    camera.rotation.x = sharedRefs.pitch.current
    camera.rotation.z = 0

    sharedRefs.pathT.current   = 0
    sharedRefs.targetT.current = -1
    sharedRefs.autoYaw.current = false
    initialized.current = true

    onReady(built.length)
  }, [scene])

  useFrame((_, dt) => {
    if (!initialized.current || wps.current.length < 2) return
    dt = Math.min(dt, 0.05)

    const maxT = wps.current.length - 1

    if (sharedRefs.targetT.current >= 0) {
      const diff = sharedRefs.targetT.current - sharedRefs.pathT.current
      sharedRefs.pathT.current += diff * Math.min(1, 7 * dt)
      sharedRefs.vel.current    = 0
      if (Math.abs(diff) < 0.0005) {
        sharedRefs.pathT.current   = sharedRefs.targetT.current
        sharedRefs.targetT.current = -1
        sharedRefs.autoYaw.current = false
      }
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
      sharedRefs.vel.current *= 0.90
      if (Math.abs(sharedRefs.vel.current) < 0.000008) sharedRefs.vel.current = 0
    }

    const pos = catmullRomPoint(sharedRefs.pathT.current, wps.current)
    camera.position.copy(pos)

    if (sharedRefs.autoYaw.current) {
      const pathYaw = catmullRomYaw(sharedRefs.pathT.current, wps.current)
      sharedRefs.yaw.current = lerpAngle(sharedRefs.yaw.current, pathYaw, Math.min(1, 3 * dt))
    }

    const clampedPitch = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, sharedRefs.pitch.current))
    camera.rotation.order = 'YXZ'
    camera.rotation.y = sharedRefs.yaw.current
    camera.rotation.x = clampedPitch
    camera.rotation.z = 0
  })

  return <primitive object={scene} />
}

// ─── Camera View HUD ──────────────────────────────────────────────────────────
function ViewHUD({ pathT, numWps }) {
  const viewNum = Math.min(numWps, Math.round(pathT) + 1)
  const pct     = numWps > 1 ? pathT / (numWps - 1) : 0

  return (
    <div style={{
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(4,12,30,0.78)', border: '1px solid rgba(100,180,255,0.25)',
        borderRadius: '40px', backdropFilter: 'blur(18px)',
        padding: '6px 22px', display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{ color: 'rgba(100,180,255,0.7)', fontFamily: 'monospace',
          fontSize: '0.65rem', letterSpacing: '0.18em' }}>CAMERA VIEW</div>
        <div style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 900,
          fontSize: '1.05rem', letterSpacing: '0.08em' }}>
          {viewNum}<span style={{ color: 'rgba(100,180,255,0.5)', fontWeight: 400 }}> / {numWps}</span>
        </div>
      </div>

      <div style={{
        width: '260px', height: '3px', background: 'rgba(255,255,255,0.1)',
        borderRadius: '99px', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: '99px',
          width: `${Math.max(0, Math.min(100, pct * 100))}%`,
          background: 'linear-gradient(90deg, #2196f3, #00e5ff)',
          transition: 'width 0.08s linear',
          boxShadow: '0 0 8px #00e5ff88',
        }} />
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {Array.from({ length: numWps }, (_, i) => {
          const active = Math.round(pathT) === i
          const passed = pathT > i - 0.5
          return (
            <div key={i} style={{
              width: active ? '10px' : '6px',
              height: active ? '10px' : '6px',
              borderRadius: '50%',
              background: active ? '#00e5ff' : passed ? 'rgba(33,150,243,0.7)' : 'rgba(255,255,255,0.18)',
              boxShadow: active ? '0 0 10px #00e5ffaa' : 'none',
              transition: 'all 0.25s ease',
              border: active ? '1.5px solid #fff' : '1px solid rgba(255,255,255,0.2)',
            }} />
          )
        })}
      </div>
    </div>
  )
}

// ─── Navigation Controls HUD ──────────────────────────────────────────────────
function NavControls({ onPrev, onNext, pathT, numWps }) {
  const atStart = pathT <= 0.05
  const atEnd   = pathT >= numWps - 1.05

  const btnStyle = (disabled) => ({
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    background: 'rgba(4,12,30,0.82)',
    border: '1px solid rgba(100,180,255,0.28)',
    borderRadius: '50%', width: '46px', height: '46px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(18px)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    transition: 'transform 0.15s, opacity 0.2s, box-shadow 0.15s',
    userSelect: 'none',
    pointerEvents: disabled ? 'none' : 'auto',
  })

  return (
    <div style={{
      position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 40, display: 'flex', gap: '14px', alignItems: 'center',
    }}>
      <div
        style={btnStyle(atStart)}
        onClick={onPrev}
        onMouseEnter={e => { if (!atStart) { e.currentTarget.style.transform = 'scale(1.12)'; e.currentTarget.style.boxShadow = '0 6px 32px rgba(33,150,243,0.45)' }}}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.5)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6af" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </div>

      <div style={{
        background: 'rgba(4,12,30,0.82)', border: '1px solid rgba(100,180,255,0.2)',
        borderRadius: '20px', padding: '7px 18px', backdropFilter: 'blur(18px)',
        color: 'rgba(100,180,255,0.65)', fontFamily: 'monospace', fontSize: '0.65rem',
        letterSpacing: '0.12em', whiteSpace: 'nowrap',
      }}>
        SCROLL / DRAG TO NAVIGATE
      </div>

      <div
        style={btnStyle(atEnd)}
        onClick={onNext}
        onMouseEnter={e => { if (!atEnd) { e.currentTarget.style.transform = 'scale(1.12)'; e.currentTarget.style.boxShadow = '0 6px 32px rgba(33,150,243,0.45)' }}}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.5)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6af" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
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

  const [numWps, setNumWps] = useState(0)
  const [ready,  setReady]  = useState(false)
  const [hudT,   setHudT]   = useState(0)

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
      sharedRefs.autoYaw.current = false
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [numWps])

  useEffect(() => {
    const sens = 0.0038
    const onDown = e => {
      dragState.current = { active: true, x: e.clientX, y: e.clientY }
      sharedRefs.autoYaw.current = false
    }
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
      sharedRefs.autoYaw.current = false
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
    window.addEventListener('touchmove', onTouchMove,   { passive: true })
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
    if (numWps < 2) return
    const maxT = numWps - 1
    const onKey = e => {
      let idx = -1
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        idx = Math.min(maxT, Math.floor(sharedRefs.pathT.current + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        idx = Math.max(0, Math.ceil(sharedRefs.pathT.current - 1))
      }
      if (idx >= 0) {
        sharedRefs.targetT.current = idx
        sharedRefs.autoYaw.current = false
        const wp = sharedRefs.wpsRef.current[idx]
        if (wp) {
          sharedRefs.yaw.current   = wp.yaw
          sharedRefs.pitch.current = -0.04
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numWps])

  useEffect(() => {
    const id = setInterval(() => {
      setHudT(sharedRefs.pathT.current)
    }, 80)
    return () => clearInterval(id)
  }, [])

  const goToWaypoint = useCallback((idx) => {
    const maxT = numWps - 1
    const clamped = Math.max(0, Math.min(maxT, idx))
    sharedRefs.targetT.current = clamped
    sharedRefs.autoYaw.current = false
    const wp = sharedRefs.wpsRef.current[clamped]
    if (wp) {
      sharedRefs.yaw.current   = wp.yaw
      sharedRefs.pitch.current = -0.04
    }
  }, [numWps])

  const handlePrev = useCallback(() => {
    const prev = Math.max(0, Math.round(sharedRefs.pathT.current) - 1)
    goToWaypoint(prev)
  }, [goToWaypoint])

  const handleNext = useCallback(() => {
    const next = Math.min(numWps - 1, Math.round(sharedRefs.pathT.current) + 1)
    goToWaypoint(next)
  }, [goToWaypoint, numWps])

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(100,180,255,0.3); border-radius: 4px; }
      `}</style>

      {!ready && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200, background: '#060e1e',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '18px',
        }}>
          <div style={{
            width: '52px', height: '52px', border: '3px solid rgba(33,150,243,0.2)',
            borderTopColor: '#2196f3', borderRadius: '50%',
            animation: 'spin 0.9s linear infinite',
          }} />
          <div style={{ color: 'rgba(100,180,255,0.7)', fontFamily: 'monospace',
            fontSize: '0.75rem', letterSpacing: '0.22em' }}>LOADING CITY...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden',
        background: '#87CEEB', cursor: 'grab' }}>
        <Canvas
          camera={{ fov: 65, near: 1, far: 9000000 }}
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

        {ready && numWps > 0 && (
          <ViewHUD pathT={hudT} numWps={numWps} />
        )}

        {ready && numWps > 1 && (
          <NavControls
            onPrev={handlePrev}
            onNext={handleNext}
            pathT={hudT}
            numWps={numWps}
          />
        )}
      </div>
    </>
  )
}
