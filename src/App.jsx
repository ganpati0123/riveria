import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useRef, useEffect, useState, Suspense, useCallback } from 'react'
import * as THREE from 'three'

const WP_NAMES = [
  'Object_7',
  'Object_622',
  'Object_1099',
  'Object_1033',
  'Object_1108',
  'Bus_stop001_87',
  'Object_628',
  'Object_13',
  'Object_619',
  'Object_1063',
  'Object_1015',
  'Object_1069',
  'Object_1084',
]

const ROAD_YAWS = [
  -Math.PI / 2,
  -Math.PI / 2,
   0,
  -Math.PI / 2,
  -Math.PI / 2,
  -Math.PI / 2,
   Math.PI,
   Math.PI,
   Math.PI / 2,
   Math.PI / 2,
   0,
   0,
   0,
]

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
  const y0=wps[Math.max(seg-1,0)].yaw, y1=wps[seg].yaw
  const y2=wps[Math.min(seg+1,maxT)].yaw, y3=wps[Math.min(seg+2,maxT)].yaw
  const d01=lerpAngle(0,y1-y0,1),d12=lerpAngle(0,y2-y1,1),d23=lerpAngle(0,y3-y2,1)
  const m1=.5*(d01+d12),m2=.5*(d12+d23),t2=f*f,t3=t2*f
  return y1+m1*f+(-3*d12+2*m1+m2)*t2+(2*d12-m1-m2)*t3
}

function Scene({ sharedRefs, onReady }) {
  const { camera } = useThree()
  const { scene }  = useGLTF('/futuristic_low-poly_city.glb')
  const wps          = useRef([])
  const initialized  = useRef(false)
  const lastWpIdx    = useRef(-1)

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
    sharedRefs.pitch.current = 0
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
        const idx = Math.round(sharedRefs.pathT.current)
        if (idx >= 0 && idx < ROAD_YAWS.length) {
          const goingBack = diff < 0
          sharedRefs.yaw.current = ROAD_YAWS[idx] + (goingBack ? Math.PI : 0)
          lastWpIdx.current = idx
        }
        sharedRefs.pitch.current = 0
      }
    } else {
      sharedRefs.pathT.current += sharedRefs.vel.current
      if (sharedRefs.pathT.current <= 0) { sharedRefs.pathT.current=0; if(sharedRefs.vel.current<0) sharedRefs.vel.current=0 }
      if (sharedRefs.pathT.current >= maxT) { sharedRefs.pathT.current=maxT; if(sharedRefs.vel.current>0) sharedRefs.vel.current=0 }
      sharedRefs.vel.current *= 0.93
      if (Math.abs(sharedRefs.vel.current) < 0.000006) sharedRefs.vel.current = 0

      if (!sharedRefs.dragging.current) {
        const roundedT = Math.round(sharedRefs.pathT.current)
        const dist = Math.abs(sharedRefs.pathT.current - roundedT)
        if (dist < 0.08 && roundedT >= 0 && roundedT < ROAD_YAWS.length && roundedT !== lastWpIdx.current) {
          const goingBack = sharedRefs.vel.current < 0
          sharedRefs.yaw.current = ROAD_YAWS[roundedT] + (goingBack ? Math.PI : 0)
          sharedRefs.pitch.current = 0
          lastWpIdx.current = roundedT
        }
      }
    }
    camera.position.copy(catmullRomPoint(sharedRefs.pathT.current, wps.current))
    camera.rotation.order = 'YXZ'
    camera.rotation.y = sharedRefs.yaw.current
    camera.rotation.x = 0
    camera.rotation.z = 0
  })

  return <primitive object={scene} />
}

function LoadingScreen({ fading }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#87CEEB',
      transition: 'opacity 0.6s ease',
      opacity: fading ? 0 : 1,
      pointerEvents: fading ? 'none' : 'all',
    }}>
      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
          40% { transform: translateY(-10px); opacity: 1; }
        }
      `}</style>
      <div style={{
        width: '80px', height: '80px',
        border: '2px solid rgba(0,0,0,0.15)',
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '8px',
        background: 'rgba(255,255,255,0.25)',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)',
            animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const sharedRefs = useRef({
    pathT:    { current: 0 },
    targetT:  { current: -1 },
    vel:      { current: 0 },
    yaw:      { current: 0 },
    pitch:    { current: 0 },
    eyeH:     { current: 100 },
    autoYaw:  { current: false },
    wpsRef:   { current: [] },
    dragging: { current: false },
  }).current

  const [numWps, setNumWps] = useState(0)
  const [showLoader, setShowLoader] = useState(true)
  const [fading, setFading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const handleReady = useCallback((n) => {
    setNumWps(n)
    setFading(true)
    setTimeout(() => setShowLoader(false), 650)
  }, [])

  useEffect(() => {
    let dragging = false
    let lastX = 0, lastY = 0
    const onMouseDown = e => {
      dragging = true; lastX = e.clientX; lastY = e.clientY
      sharedRefs.dragging.current = true
      setIsDragging(true)
    }
    const onMouseMove = e => {
      if (!dragging) return
      const dx = e.clientX - lastX, dy = e.clientY - lastY
      lastX = e.clientX; lastY = e.clientY
      sharedRefs.yaw.current -= dx * 0.0022
      sharedRefs.autoYaw.current = false
    }
    const onMouseUp = () => { dragging = false; sharedRefs.dragging.current = false; setIsDragging(false) }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [])

  useEffect(() => {
    const DIRECTION_LOCK_PX      = 10
    const TOUCH_MOVE_SENSITIVITY = 0.000020
    const TOUCH_LOOK_SENSITIVITY = 0.0030
    const FLICK_VELOCITY_SCALE   = 2.2
    const state = { active:false, startX:0, startY:0, lastX:0, lastY:0, startTime:0, vx:0, vy:0, totalDX:0, totalDY:0, direction:null }

    const onTouchStart = e => {
      if (e.touches.length > 1) { state.active = false; return }
      const t = e.touches[0]
      Object.assign(state, { active:true, startX:t.clientX, startY:t.clientY, lastX:t.clientX, lastY:t.clientY, startTime:Date.now(), totalDX:0, totalDY:0, direction:null, vx:0, vy:0 })
      sharedRefs.dragging.current = true
      sharedRefs.autoYaw.current = false
      sharedRefs.targetT.current = -1
    }

    const onTouchMove = e => {
      if (!state.active || e.touches.length > 1) return
      const t = e.touches[0]
      const dx = t.clientX - state.lastX, dy = t.clientY - state.lastY
      state.lastX = t.clientX; state.lastY = t.clientY
      state.vx = state.vx*0.6 + dx*0.4
      state.vy = state.vy*0.6 + dy*0.4
      state.totalDX += dx; state.totalDY += dy

      if (!state.direction) {
        const adx = Math.abs(state.totalDX), ady = Math.abs(state.totalDY)
        if (adx > DIRECTION_LOCK_PX || ady > DIRECTION_LOCK_PX) {
          if (ady > adx*1.2) state.direction = 'vertical'
          else if (adx > ady*1.2) state.direction = 'horizontal'
          else state.direction = 'free'
        }
        return
      }

      if (state.direction === 'vertical' || state.direction === 'free') {
        sharedRefs.vel.current += -dy * TOUCH_MOVE_SENSITIVITY
        sharedRefs.targetT.current = -1
      }
      if (state.direction === 'horizontal' || state.direction === 'free') { sharedRefs.yaw.current -= dx*TOUCH_LOOK_SENSITIVITY; sharedRefs.autoYaw.current = false }
    }

    const onTouchEnd = e => {
      if (!state.active) return
      state.active = false
      sharedRefs.dragging.current = false
      const elapsed = Date.now() - state.startTime
      if (elapsed < 220 && (state.direction === 'vertical' || state.direction === 'free')) {
        sharedRefs.vel.current += -state.vy * TOUCH_MOVE_SENSITIVITY * FLICK_VELOCITY_SCALE * 18
        sharedRefs.targetT.current = -1
      }
    }

    window.addEventListener('touchstart',  onTouchStart, { passive:true })
    window.addEventListener('touchmove',   onTouchMove,  { passive:true })
    window.addEventListener('touchend',    onTouchEnd,   { passive:true })
    window.addEventListener('touchcancel', onTouchEnd,   { passive:true })
    return () => {
      window.removeEventListener('touchstart',  onTouchStart)
      window.removeEventListener('touchmove',   onTouchMove)
      window.removeEventListener('touchend',    onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  useEffect(() => {
    const onWheel = e => {
      e.preventDefault()
      const norm = e.deltaMode===1?40:e.deltaMode===2?800:1
      const dy = e.deltaY*norm, dx = e.deltaX*norm
      sharedRefs.vel.current += dy*0.000016
      sharedRefs.targetT.current = -1
      sharedRefs.yaw.current -= dx*0.0022
      sharedRefs.autoYaw.current = false
    }
    window.addEventListener('wheel', onWheel, { passive:false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (numWps < 2) return
    const maxT = numWps - 1
    const onKey = e => {
      let idx = -1
      if (e.key==='ArrowRight'||e.key==='ArrowDown') { e.preventDefault(); idx=Math.min(maxT,Math.floor(sharedRefs.pathT.current+1)) }
      else if (e.key==='ArrowLeft'||e.key==='ArrowUp') { e.preventDefault(); idx=Math.max(0,Math.ceil(sharedRefs.pathT.current-1)) }
      if (idx >= 0) {
        sharedRefs.targetT.current = idx; sharedRefs.autoYaw.current = false
        const wp = sharedRefs.wpsRef.current[idx]
        if (wp) { sharedRefs.yaw.current=wp.yaw; sharedRefs.pitch.current=-0.04 }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numWps])

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; cursor: default; }
        [data-canvas-wrap] { cursor: grab; }
        [data-canvas-wrap].dragging { cursor: grabbing; }
      `}</style>

      <div data-canvas-wrap="" className={isDragging ? 'dragging' : ''} style={{ width:'100vw', height:'100vh', overflow:'hidden', background:'#87CEEB', position:'relative' }}>
        <Canvas camera={{ fov:65, near:1, far:9000000 }} gl={{ antialias:true }} style={{ width:'100%', height:'100%', display:'block' }} onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace }}>
          <color attach="background" args={['#87CEEB']} />
          <ambientLight intensity={1.4} />
          <directionalLight position={[2000,5000,3000]} intensity={1.8} />
          <hemisphereLight args={['#c8e8ff','#4a6030',0.55]} />
          <Suspense fallback={null}>
            <Scene sharedRefs={sharedRefs} onReady={handleReady} />
          </Suspense>
        </Canvas>
        {showLoader && <LoadingScreen fading={fading} />}
      </div>
    </>
  )
}
