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

const PARTICLE_DELAYS = [0,.18,.36,.54,.09,.27,.45,.63,.12,.30,.48,.66,.06,.24,.42,.60,.15,.33,.51,.69,.03,.21,.39,.57]

const TWO_D_URL = 'https://www.openstreetmap.org/export/embed.html?bbox=72.8,18.9,73.0,19.1&layer=mapnik'

function Switch2DBtn({ onClick }) {
  return (
    <div style={{position:'fixed',top:'16px',right:'20px',zIndex:999,pointerEvents:'auto'}}>
      <style>{`
        @keyframes sw2d-pulse{0%,100%{box-shadow:0 0 0 #00e5ff00}50%{box-shadow:0 0 10px #00e5ff66}}
        .sw2d{
          font-family:'Share Tech Mono','Courier New',monospace;
          font-size:12px;letter-spacing:.1em;color:#00e5ff;
          border:1px solid rgba(0,229,255,.65);border-radius:999px;
          padding:6px 18px;background:rgba(0,0,0,.55);
          backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
          cursor:pointer;user-select:none;
          animation:sw2d-pulse 2.5s ease-in-out infinite;
          white-space:nowrap;transition:background .2s;
        }
        .sw2d:hover{background:rgba(0,229,255,.12);}
      `}</style>
      <div className="sw2d" onClick={onClick}>Switch to 2D</div>
    </div>
  )
}

function View2DOverlay({ onClose }) {
  return (
    <div style={{
      position:'fixed',inset:0,zIndex:998,
      display:'flex',flexDirection:'column',
      background:'#000',
    }}>
      <style>{`
        @keyframes ov-fadein{from{opacity:0}to{opacity:1}}
        @keyframes back3d-pulse{0%,100%{box-shadow:0 0 0 #00e5ff00}50%{box-shadow:0 0 10px #00e5ff66}}
        .back3d{
          font-family:'Share Tech Mono','Courier New',monospace;
          font-size:12px;letter-spacing:.1em;color:#00e5ff;
          border:1px solid rgba(0,229,255,.65);border-radius:999px;
          padding:6px 18px;background:rgba(0,0,0,.7);
          backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
          cursor:pointer;user-select:none;
          animation:back3d-pulse 2.5s ease-in-out infinite;
          white-space:nowrap;transition:background .2s;
        }
        .back3d:hover{background:rgba(0,229,255,.12);}
      `}</style>

      <div style={{
        position:'absolute',top:'16px',left:'20px',zIndex:10,
        animation:'ov-fadein .3s ease',
      }}>
        <div className="back3d" onClick={onClose}>← Back to 3D</div>
      </div>

      <iframe
        src={TWO_D_URL}
        style={{
          width:'100%',height:'100%',border:'none',
          animation:'ov-fadein .4s ease',
        }}
        allowFullScreen
        title="2D View"
      />
    </div>
  )
}

function LoadingScreen({ fading }) {
  return (
    <div style={{
      position:'fixed',inset:0,zIndex:100,overflow:'hidden',
      background:'radial-gradient(ellipse at 50% 62%, #0c0720 0%, #06030f 55%, #000 100%)',
      transition:'opacity 0.6s ease',
      opacity: fading ? 0 : 1,
      pointerEvents: fading ? 'none' : 'all',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Share+Tech+Mono&display=swap');

        @keyframes an-sqpulse{
          0%,100%{opacity:.8;box-shadow:0 0 10px #00e5ff,0 0 22px #00e5ff55}
          50%{opacity:1;box-shadow:0 0 20px #00e5ff,0 0 44px #00e5ffaa}
        }
        @keyframes an-titleglow{
          0%,100%{text-shadow:0 0 8px #00e5ff,0 0 20px #00e5ff77}
          50%{text-shadow:0 0 14px #00e5ff,0 0 36px #00e5ffcc}
        }
        @keyframes an-goldglow{
          0%,100%{text-shadow:0 0 6px #ffd700,0 0 16px #ffd70055}
          50%{text-shadow:0 0 12px #ffd700,0 0 28px #ffd700aa}
        }
        @keyframes an-fadeup{
          from{opacity:0;transform:translateY(8px)}
          to{opacity:.75;transform:translateY(0)}
        }
        @keyframes an-twinkle{
          0%,100%{opacity:.05;transform:scale(1)}
          50%{opacity:.65;transform:scale(1.5)}
        }
        @keyframes an-moon{
          0%,100%{filter:drop-shadow(0 0 7px #ffd70099) drop-shadow(0 0 18px #ffd70044)}
          50%{filter:drop-shadow(0 0 14px #ffd700cc) drop-shadow(0 0 32px #ffd70066)}
        }
        @keyframes an-lantern{
          0%,100%{transform:rotate(-5deg);filter:drop-shadow(0 0 8px #ff8c00aa)}
          50%{transform:rotate(5deg);filter:drop-shadow(0 0 16px #ff8c00dd)}
        }
        @keyframes an-lantern2{
          0%,100%{transform:rotate(5deg);filter:drop-shadow(0 0 8px #ff6b0099)}
          50%{transform:rotate(-5deg);filter:drop-shadow(0 0 16px #ff6b00cc)}
        }
        @keyframes an-orb{0%,100%{opacity:.08}50%{opacity:.15}}
        @keyframes an-divider{0%,100%{opacity:.3}50%{opacity:.75}}
        @keyframes an-progress{0%{width:0%}100%{width:88%}}

        /* particle dissolve-reform */
        @keyframes an-particle{
          0%  {opacity:0;transform:scale(0) translate(0,0)}
          20% {opacity:1;transform:scale(1) translate(0,0)}
          60% {opacity:1;transform:scale(1) translate(0,0)}
          80% {opacity:0;transform:scale(0) translate(0,0)}
          100%{opacity:0;transform:scale(0) translate(0,0)}
        }
        .an-particle{
          width:6px;height:6px;border-radius:1px;background:#00e5ff;
          position:absolute;
          animation:an-particle 3s ease-in-out infinite;
          box-shadow:0 0 4px #00e5ff;
        }

        .an-sq{
          width:28px;height:28px;border-radius:4px;background:#00e5ff;
          animation:an-sqpulse 2s ease-in-out infinite;
        }
        .an-sq:nth-child(2){animation-delay:.28s}
        .an-sq:nth-child(3){animation-delay:.14s}
        .an-sq:nth-child(4){animation-delay:.42s}

        .an-title{
          font-family:'Share Tech Mono','Courier New',monospace;
          font-size:15px;letter-spacing:.22em;
          color:#00e5ff;text-transform:uppercase;
          margin-top:18px;
          animation:an-titleglow 2s ease-in-out infinite;
        }
        .an-subtitle{
          font-family:'Share Tech Mono','Courier New',monospace;
          font-size:10px;letter-spacing:.3em;
          color:#ffd700;text-transform:uppercase;
          margin-top:5px;opacity:0;
          animation:an-goldglow 2.5s ease-in-out infinite, an-fadeup .8s ease-out .4s forwards;
        }
        .an-divider{
          width:140px;height:1px;margin-top:14px;
          background:linear-gradient(90deg,transparent,#ffd700,transparent);
          animation:an-divider 2.5s ease-in-out infinite;
        }
        .an-tag{
          font-family:'Share Tech Mono','Courier New',monospace;
          font-size:11px;color:#00e5ff;letter-spacing:.05em;
          text-align:center;line-height:1.7;
          margin-top:12px;max-width:300px;opacity:0;
          animation:an-fadeup .9s ease-out .7s forwards;
        }
        .an-moon{animation:an-moon 3s ease-in-out infinite}
        .an-lantern-l{animation:an-lantern 3.5s ease-in-out infinite;transform-origin:top center}
        .an-lantern-r{animation:an-lantern2 4s ease-in-out .5s infinite;transform-origin:top center}
        .an-progress-bar{width:160px;height:1.5px;background:rgba(0,229,255,.13);border-radius:2px;margin-top:18px;overflow:hidden}
        .an-progress-fill{height:100%;background:linear-gradient(90deg,#00e5ff,#7fffff);box-shadow:0 0 6px #00e5ff;animation:an-progress 4s ease-out forwards}
      `}</style>

      {/* nebula */}
      <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'500px',height:'500px',borderRadius:'50%',background:'radial-gradient(circle,#1a0a3a1a 0%,transparent 70%)',animation:'an-orb 5s ease-in-out infinite',pointerEvents:'none'}}/>

      {/* stars */}
      {[...Array(50)].map((_,i)=>{
        const sz=i%8===0?2:i%3===0?1.5:1
        return <div key={i} style={{position:'absolute',left:`${(i*43+7)%100}%`,top:`${(i*61+3)%100}%`,width:`${sz}px`,height:`${sz}px`,borderRadius:'50%',background:i%6===0?'#ffd700':'#00e5ff',animation:`an-twinkle ${1.1+(i%7)*.4}s ease-in-out ${(i*.22)%2.5}s infinite`}}/>
      })}

      {/* moon */}
      <div style={{position:'absolute',top:'28px',left:'50%',transform:'translateX(-50%)'}}>
        <span className="an-moon" style={{display:'block',color:'#ffd700',fontSize:'26px',lineHeight:1}}>☽</span>
      </div>

      {/* lanterns */}
      <div style={{position:'absolute',top:0,left:'clamp(28px,5vw,70px)',display:'flex',flexDirection:'column',alignItems:'center',pointerEvents:'none'}}>
        <div style={{width:'1px',height:'55px',background:'linear-gradient(#ffd70077,transparent)'}}/>
        <div className="an-lantern-l" style={{fontSize:'clamp(26px,3.5vw,40px)'}}>🪔</div>
      </div>
      <div style={{position:'absolute',top:0,right:'clamp(28px,5vw,70px)',display:'flex',flexDirection:'column',alignItems:'center',pointerEvents:'none'}}>
        <div style={{width:'1px',height:'55px',background:'linear-gradient(#ffd70077,transparent)'}}/>
        <div className="an-lantern-r" style={{fontSize:'clamp(26px,3.5vw,40px)'}}>🪔</div>
      </div>

      {/* center content */}
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>

        {/* dissolve-reform particles above grid */}
        <div style={{position:'relative',width:'80px',height:'44px',marginBottom:'8px'}}>
          {PARTICLE_DELAYS.map((d,i)=>{
            const col=i%6, row=Math.floor(i/6)
            const gx=col*12+2, gy=row*14+2
            return <div key={i} className="an-particle" style={{left:`${gx}px`,top:`${gy}px`,animationDelay:`${d}s`,animationDuration:`${2.4+(i%4)*.3}s`}}/>
          })}
        </div>

        {/* 2×2 main squares */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
          <div className="an-sq"/><div className="an-sq"/>
          <div className="an-sq"/><div className="an-sq"/>
        </div>

        <div className="an-title">Loading Riviera</div>
        <div className="an-subtitle">Arabian Nights · Cultural Fest</div>
        <div className="an-divider"/>
        <div className="an-tag">
          When the world settles... try nudging it —<br/>
          a thousand wonders wait beyond the dunes
        </div>
        <div className="an-progress-bar"><div className="an-progress-fill"/></div>
      </div>

      {/* bottom gold border */}
      <div style={{position:'absolute',bottom:0,left:0,right:0,height:'2px',background:'linear-gradient(90deg,transparent,#ffd70055 25%,#ffd700 50%,#ffd70055 75%,transparent)',boxShadow:'0 0 10px #ffd70055'}}/>
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
  const [show2D, setShow2D] = useState(false)

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
        {show2D && <View2DOverlay onClose={() => setShow2D(false)} />}
        <Switch2DBtn onClick={() => setShow2D(true)} />
      </div>
    </>
  )
}
