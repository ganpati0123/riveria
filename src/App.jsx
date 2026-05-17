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
    camera.rotation.x = window.innerWidth > 600 ? sharedRefs.pitch.current : 0
    camera.rotation.z = 0
  })

  return <primitive object={scene} />
}

function LoadingScreen({ fading }) {
  return (
    <div style={{
      position:'fixed',inset:0,zIndex:100,overflow:'hidden',
      background:'radial-gradient(ellipse at 50% 60%, #0a0618 0%, #060310 55%, #000 100%)',
      transition:'opacity 0.6s ease',
      opacity: fading ? 0 : 1,
      pointerEvents: fading ? 'none' : 'all',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Share+Tech+Mono&display=swap');

        @keyframes an-sqpulse {
          0%,100%{opacity:.75;box-shadow:0 0 14px #00e5ff,0 0 30px #00e5ff55}
          50%{opacity:1;box-shadow:0 0 24px #00e5ff,0 0 55px #00e5ffaa,0 0 80px #00e5ff22}
        }
        @keyframes an-titleglow {
          0%,100%{text-shadow:0 0 12px #00e5ff,0 0 28px #00e5ff88,0 0 50px #00e5ff33}
          50%{text-shadow:0 0 20px #00e5ff,0 0 45px #00e5ffcc,0 0 80px #00e5ff55}
        }
        @keyframes an-goldglow {
          0%,100%{text-shadow:0 0 8px #ffd700,0 0 20px #ffd70066}
          50%{text-shadow:0 0 14px #ffd700,0 0 35px #ffd700aa,0 0 60px #ffd70033}
        }
        @keyframes an-fadeup {
          from{opacity:0;transform:translateY(10px)}
          to{opacity:.8;transform:translateY(0)}
        }
        @keyframes an-twinkle {
          0%,100%{opacity:.06;transform:scale(1)}
          50%{opacity:.7;transform:scale(1.4)}
        }
        @keyframes an-moon {
          0%,100%{filter:drop-shadow(0 0 8px #ffd70088) drop-shadow(0 0 20px #ffd70044)}
          50%{filter:drop-shadow(0 0 16px #ffd700cc) drop-shadow(0 0 40px #ffd70077)}
        }
        @keyframes an-lantern {
          0%,100%{transform:rotate(-4deg);filter:drop-shadow(0 0 8px #ff8c0099)}
          50%{transform:rotate(4deg);filter:drop-shadow(0 0 14px #ff8c00cc)}
        }
        @keyframes an-lantern2 {
          0%,100%{transform:rotate(5deg);filter:drop-shadow(0 0 8px #ff6b0088)}
          50%{transform:rotate(-5deg);filter:drop-shadow(0 0 14px #ff6b00bb)}
        }
        @keyframes an-btnpulse {
          0%,100%{box-shadow:0 0 0 #00e5ff00,inset 0 0 0 #00e5ff00}
          50%{box-shadow:0 0 12px #00e5ff55,inset 0 0 6px #00e5ff11}
        }
        @keyframes an-divider {
          0%,100%{opacity:.3;box-shadow:0 0 4px #ffd70044}
          50%{opacity:.7;box-shadow:0 0 10px #ffd70099}
        }
        @keyframes an-orbpulse {
          0%,100%{opacity:.07;transform:scale(1)}
          50%{opacity:.14;transform:scale(1.05)}
        }
        @keyframes an-progress {
          0%{width:0%} 100%{width:85%}
        }

        .an-sq{
          width:34px;height:34px;border-radius:5px;background:#00e5ff;
          animation:an-sqpulse 2s ease-in-out infinite;
        }
        .an-sq:nth-child(2){animation-delay:.3s}
        .an-sq:nth-child(3){animation-delay:.15s}
        .an-sq:nth-child(4){animation-delay:.45s}

        .an-title{
          font-family:'Cinzel','Georgia',serif;
          font-size:clamp(28px,4.5vw,52px);
          font-weight:900;letter-spacing:.18em;
          color:#00e5ff;text-transform:uppercase;
          margin-top:28px;
          animation:an-titleglow 2.2s ease-in-out infinite;
        }
        .an-subtitle{
          font-family:'Cinzel','Georgia',serif;
          font-size:clamp(11px,1.6vw,15px);
          font-weight:400;letter-spacing:.35em;
          color:#ffd700;text-transform:uppercase;
          margin-top:6px;
          animation:an-goldglow 2.5s ease-in-out infinite;
          opacity:0;
          animation:an-goldglow 2.5s ease-in-out infinite, an-fadeup .8s ease-out .3s forwards;
        }
        .an-divider{
          width:180px;height:1px;
          background:linear-gradient(90deg,transparent,#ffd700,transparent);
          margin-top:18px;
          animation:an-divider 2.5s ease-in-out infinite;
        }
        .an-tag{
          font-family:'Share Tech Mono','Courier New',monospace;
          font-size:clamp(11px,1.4vw,13px);
          color:#00e5ff;letter-spacing:.07em;
          text-align:center;line-height:1.75;
          margin-top:18px;max-width:380px;opacity:0;
          animation:an-fadeup 1s ease-out .7s forwards;
        }
        .an-sw{
          font-family:'Share Tech Mono','Courier New',monospace;
          font-size:13px;letter-spacing:.1em;color:#00e5ff;
          border:1px solid rgba(0,229,255,.6);border-radius:999px;
          padding:7px 20px;background:rgba(0,229,255,.04);
          cursor:default;user-select:none;
          animation:an-btnpulse 2.5s ease-in-out infinite;
        }
        .an-moon{animation:an-moon 3s ease-in-out infinite}
        .an-lantern-l{animation:an-lantern 3.5s ease-in-out infinite;transform-origin:top center}
        .an-lantern-r{animation:an-lantern2 4s ease-in-out 0.5s infinite;transform-origin:top center}
        .an-progress-bar{
          width:200px;height:2px;background:rgba(0,229,255,.12);
          border-radius:2px;margin-top:22px;overflow:hidden;
        }
        .an-progress-fill{
          height:100%;background:linear-gradient(90deg,#00e5ff,#7fffff);
          border-radius:2px;
          animation:an-progress 4s ease-out forwards;
          box-shadow:0 0 8px #00e5ff;
        }
      `}</style>

      {/* Deep space nebula orb */}
      <div style={{
        position:'absolute',top:'50%',left:'50%',
        transform:'translate(-50%,-50%)',
        width:'600px',height:'600px',borderRadius:'50%',
        background:'radial-gradient(circle,#1a0a3a22 0%,#0d0520 40%,transparent 70%)',
        animation:'an-orbpulse 4s ease-in-out infinite',
        pointerEvents:'none',
      }}/>

      {/* Stars */}
      {[...Array(55)].map((_,i)=>{
        const sz = i%9===0?2.5:i%4===0?1.5:1
        return (
          <div key={i} style={{
            position:'absolute',
            left:`${(i*43+7)%100}%`,top:`${(i*61+3)%100}%`,
            width:`${sz}px`,height:`${sz}px`,borderRadius:'50%',
            background: i%7===0 ? '#ffd700' : '#00e5ff',
            animation:`an-twinkle ${1.1+(i%7)*.4}s ease-in-out ${(i*.23)%2.5}s infinite`,
          }}/>
        )
      })}

      {/* Crescent moon top-center */}
      <div style={{
        position:'absolute',top:'32px',left:'50%',transform:'translateX(-50%)',
        fontSize:'28px',lineHeight:1,
      }}>
        <span className="an-moon" style={{display:'block',color:'#ffd700',fontSize:'28px'}}>☽</span>
      </div>

      {/* Left lantern */}
      <div style={{
        position:'absolute',top:'0',left:'clamp(30px,6vw,80px)',
        display:'flex',flexDirection:'column',alignItems:'center',
        pointerEvents:'none',
      }}>
        <div style={{width:'1px',height:'60px',background:'linear-gradient(#ffd70088,transparent)'}}/>
        <div className="an-lantern-l" style={{fontSize:'clamp(28px,4vw,44px)'}}>🪔</div>
      </div>

      {/* Right lantern */}
      <div style={{
        position:'absolute',top:'0',right:'clamp(30px,6vw,80px)',
        display:'flex',flexDirection:'column',alignItems:'center',
        pointerEvents:'none',
      }}>
        <div style={{width:'1px',height:'60px',background:'linear-gradient(#ffd70088,transparent)'}}/>
        <div className="an-lantern-r" style={{fontSize:'clamp(28px,4vw,44px)'}}>🪔</div>
      </div>

      {/* Top-right switch button */}
      <div style={{position:'absolute',top:'18px',right:'22px',zIndex:10}}>
        <div className="an-sw">Switch to 2D</div>
      </div>

      {/* Main center content */}
      <div style={{
        position:'absolute',inset:0,
        display:'flex',flexDirection:'column',
        alignItems:'center',justifyContent:'center',
        paddingBottom:'20px',
      }}>
        {/* 2×2 grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <div className="an-sq"/><div className="an-sq"/>
          <div className="an-sq"/><div className="an-sq"/>
        </div>

        <div className="an-title">Loading Riviera</div>

        <div className="an-subtitle">Arabian Nights · Cultural Fest</div>

        <div className="an-divider"/>

        <div className="an-tag">
          When the world settles... try nudging it
        </div>

        {/* Progress bar */}
        <div className="an-progress-bar">
          <div className="an-progress-fill"/>
        </div>
      </div>

      {/* Bottom ornamental border */}
      <div style={{
        position:'absolute',bottom:0,left:0,right:0,height:'3px',
        background:'linear-gradient(90deg,transparent 0%,#ffd70055 20%,#ffd700 50%,#ffd70055 80%,transparent 100%)',
        boxShadow:'0 0 12px #ffd70066',
      }}/>
    </div>
  )
}

useGLTF.preload('/futuristic_low-poly_city.glb')

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
      if (window.innerWidth > 600) {
        sharedRefs.pitch.current = Math.max(-0.35, Math.min(0.35, sharedRefs.pitch.current + dy * 0.0022))
      }
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
