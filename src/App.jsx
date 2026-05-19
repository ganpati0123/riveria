import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useRef, useEffect, useState, Suspense, useCallback, Component } from 'react'
import * as THREE from 'three'

class CanvasErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() {}
  render() { return this.state.failed ? null : this.props.children }
}

// ─── Waypoints ─────────────────────────────────────────────────────────────
const WP_NAMES = [
  'Object_7',
  'Object_622',
  'Object_1099',
  'Object_1033',
  'Object_1108',
  'Object_628',
  'Object_13',
  'Object_619',
  'Object_1063',
  'Object_1015',
  'Object_1069',
  'Object_1084',
]
const ROAD_YAWS = [
  -Math.PI/2, -Math.PI/2, 0, -Math.PI/2, -Math.PI/2,
  Math.PI, Math.PI, Math.PI/2, Math.PI/2,
  0, 0, 0,
]

// Nav sections → waypoint index
const NAV_WP = { home:0, schedule:1, activities:2, sponsors:3, gallery:4, contact:11 }

// Section panels shown at these waypoint indices
const SECTION_AT = {
  1: 'schedule',
  2: 'activities',
  3: 'sponsors',
  4: 'gallery',
  5: 'gallery2',
  6: 'gallery3',
  11: 'contact',
}

// How many scrolls to fill before advancing
const SCROLL_THRESHOLD = 3

// ─── Target date for countdown (change as needed) ─────────────────────────
const EVENT_DATE = new Date('2026-05-18T00:00:00')

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(() => {
    const h = () => setW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return w
}

function useCountdown() {
  const [time, setTime] = useState({ d:0, h:0, m:0, s:0 })
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, EVENT_DATE - Date.now())
      const d = Math.floor(diff/86400000)
      const h = Math.floor((diff%86400000)/3600000)
      const m = Math.floor((diff%3600000)/60000)
      const s = Math.floor((diff%60000)/1000)
      setTime({d,h,m,s})
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

// ─── Spline helpers ─────────────────────────────────────────────────────────
function catmullRomPoint(t, wps) {
  const n=wps.length, maxT=n-1
  const c=Math.max(0,Math.min(t,maxT))
  const seg=Math.min(Math.floor(c),maxT-1), f=c-seg
  const p0=wps[Math.max(seg-1,0)].pos, p1=wps[seg].pos
  const p2=wps[Math.min(seg+1,maxT)].pos, p3=wps[Math.min(seg+2,maxT)].pos
  const t2=f*f, t3=t2*f
  return new THREE.Vector3(
    .5*((2*p1.x)+(-p0.x+p2.x)*f+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    .5*((2*p1.y)+(-p0.y+p2.y)*f+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
    .5*((2*p1.z)+(-p0.z+p2.z)*f+(2*p0.z-5*p1.z+4*p2.z-p3.z)*t2+(-p0.z+3*p1.z-3*p2.z+p3.z)*t3),
  )
}
function lerpAngle(a,b,t){let d=((b-a)%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI;return a+d*t}
function catmullRomYaw(t,wps){
  const n=wps.length,maxT=n-1,c=Math.max(0,Math.min(t,maxT))
  const seg=Math.min(Math.floor(c),maxT-1),f=c-seg
  const y0=wps[Math.max(seg-1,0)].yaw,y1=wps[seg].yaw
  const y2=wps[Math.min(seg+1,maxT)].yaw,y3=wps[Math.min(seg+2,maxT)].yaw
  const d01=lerpAngle(0,y1-y0,1),d12=lerpAngle(0,y2-y1,1),d23=lerpAngle(0,y3-y2,1)
  const m1=.5*(d01+d12),m2=.5*(d12+d23),t2=f*f,t3=t2*f
  return y1+m1*f+(-3*d12+2*m1+m2)*t2+(2*d12-m1-m2)*t3
}

// ─── Switch to 2D Button (small, below Enter Games) ─────────────────────────
function Switch2DBar() {
  return (
    <div
      onClick={() => { window.top.location.href = 'https://www.rivierafest.online/' }}
      style={{
        position:'fixed', top:'60px', right:'24px',
        zIndex:99999,
        display:'flex', alignItems:'center', gap:'6px',
        padding:'7px 18px',
        background:'transparent',
        border:'1px solid rgba(0,245,255,0.6)',
        borderRadius:'3px',
        cursor:'pointer',
        transition:'all 0.2s ease',
        backdropFilter:'blur(8px)',
      }}
      onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,245,255,0.12)';e.currentTarget.style.borderColor='rgba(0,245,255,0.9)'}}
      onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='rgba(0,245,255,0.55)'}}
    >
      <svg width='10' height='10' viewBox='0 0 10 10' fill='none'>
        <rect x='0.5' y='0.5' width='3.5' height='3.5' rx='0.4' stroke='#00f5ff' strokeWidth='1.1'/>
        <rect x='6' y='0.5' width='3.5' height='3.5' rx='0.4' stroke='#00f5ff' strokeWidth='1.1'/>
        <rect x='0.5' y='6' width='3.5' height='3.5' rx='0.4' stroke='#00f5ff' strokeWidth='1.1'/>
        <rect x='6' y='6' width='3.5' height='3.5' rx='0.4' stroke='#00f5ff' strokeWidth='1.1'/>
      </svg>
      <span style={{
        fontFamily:"'Rajdhani',sans-serif",
        fontSize:'0.72rem', fontWeight:700,
        letterSpacing:'0.1em', color:'#00f5ff',
        textTransform:'uppercase',
        whiteSpace:'nowrap',
      }}>SWITCH TO 2D</span>
    </div>
  )
}

// ─── Loading Screen ─────────────────────────────────────────────────────────
function LoadingScreen({ fading }) {
  const [dots, setDots] = useState('')
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    const progInterval = setInterval(() => {
      setProgress(p => p >= 95 ? 95 : p + Math.random() * 8)
    }, 300)
    return () => { clearInterval(dotInterval); clearInterval(progInterval) }
  }, [])
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:999,
      background:'#030a12',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      fontFamily:"'Orbitron',sans-serif",
      opacity: fading ? 0 : 1,
      transition: fading ? 'opacity 0.9s ease' : 'none',
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      {/* Scan line effect */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none',
        background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,245,255,0.015) 2px,rgba(0,245,255,0.015) 4px)',
      }}/>
      {/* Corner decorations */}
      <div style={{position:'absolute',top:'24px',left:'24px',width:'40px',height:'40px',
        borderTop:'2px solid rgba(0,245,255,0.6)',borderLeft:'2px solid rgba(0,245,255,0.6)',
        filter:'drop-shadow(0 0 8px #00f5ff)'}}/>
      <div style={{position:'absolute',top:'24px',right:'24px',width:'40px',height:'40px',
        borderTop:'2px solid rgba(0,245,255,0.6)',borderRight:'2px solid rgba(0,245,255,0.6)',
        filter:'drop-shadow(0 0 8px #00f5ff)'}}/>
      <div style={{position:'absolute',bottom:'24px',left:'24px',width:'40px',height:'40px',
        borderBottom:'2px solid rgba(0,245,255,0.6)',borderLeft:'2px solid rgba(0,245,255,0.6)',
        filter:'drop-shadow(0 0 8px #00f5ff)'}}/>
      <div style={{position:'absolute',bottom:'24px',right:'24px',width:'40px',height:'40px',
        borderBottom:'2px solid rgba(0,245,255,0.6)',borderRight:'2px solid rgba(0,245,255,0.6)',
        filter:'drop-shadow(0 0 8px #00f5ff)'}}/>

      {/* Logo / title */}
      <div style={{
        color:'rgba(0,245,255,0.5)', fontSize:'0.6rem',
        letterSpacing:'0.4em', marginBottom:'16px',
        animation:'blinkDot 1.5s ease-in-out infinite',
      }}>◉ SYSTEM BOOT</div>

      <div style={{
        fontSize:'clamp(2.2rem,6vw,4rem)', fontWeight:900,
        color:'#ffffff', letterSpacing:'0.08em',
        textShadow:'0 0 40px rgba(255,255,255,0.15)',
        lineHeight:1,
      }}>RIVIERA</div>
      <div style={{
        fontSize:'clamp(2.2rem,6vw,4rem)', fontWeight:900,
        letterSpacing:'0.08em', lineHeight:1,
        background:'linear-gradient(90deg,#ff0080,#ff6600)',
        WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
        filter:'drop-shadow(0 0 18px #ff008077)',
        marginBottom:'8px',
      }}>FEST 2026</div>

      <div style={{
        color:'rgba(0,245,255,0.7)', fontSize:'0.58rem',
        letterSpacing:'0.3em', marginBottom:'48px',
      }}>ENTERING THE DIGITAL ARENA</div>

      {/* Progress bar */}
      <div style={{width:'clamp(220px,40vw,380px)', marginBottom:'12px'}}>
        <div style={{
          height:'2px', background:'rgba(0,245,255,0.1)',
          borderRadius:'2px', overflow:'hidden',
          position:'relative',
        }}>
          <div style={{
            position:'absolute', top:0, left:0, height:'100%',
            width:`${progress}%`,
            background:'linear-gradient(90deg,#00f5ff,#ff0080)',
            boxShadow:'0 0 12px rgba(0,245,255,0.8)',
            transition:'width 0.3s ease',
          }}/>
        </div>
      </div>

      <div style={{
        color:'rgba(0,245,255,0.5)', fontSize:'0.5rem',
        letterSpacing:'0.2em',
      }}>LOADING ENVIRONMENT{dots}</div>
    </div>
  )
}

// ─── Scene ──────────────────────────────────────────────────────────────────
function Scene({ sharedRefs, onReady }) {
  const { camera } = useThree()
  const { scene }  = useGLTF('/futuristic_low-poly_city.glb')
  const wps        = useRef([])
  const initialized= useRef(false)

  useEffect(() => {
    scene.scale.set(5000,5000,5000)
    scene.rotation.y = Math.PI/2
    scene.updateMatrixWorld(true)
    const box0 = new THREE.Box3().setFromObject(scene)
    const center = box0.getCenter(new THREE.Vector3())
    scene.position.set(-center.x,-box0.min.y,-center.z)
    scene.updateMatrixWorld(true)
    scene.matrixAutoUpdate = false
    const box  = new THREE.Box3().setFromObject(scene)
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
      let fwd=new THREE.Vector3(0,0,1)
      if (next){fwd.subVectors(next,worldPos);fwd.y=0;fwd.normalize()}
      else if(prev){fwd.subVectors(worldPos,prev);fwd.y=0;fwd.normalize()}
      const pos=worldPos.clone(); pos.y=groundY
      return {pos,fwd:fwd.clone(),yaw:Math.atan2(-fwd.x,-fwd.z)}
    })
    built.forEach((wp,i)=>{if(i<ROAD_YAWS.length) wp.yaw=ROAD_YAWS[i]})
    wps.current = built
    sharedRefs.wpsRef.current = built
    sharedRefs.yaw.current = ROAD_YAWS[0]
    sharedRefs.pitch.current = -0.04
    camera.position.copy(built[0].pos)
    camera.rotation.order='YXZ'
    camera.rotation.y=sharedRefs.yaw.current
    camera.rotation.x=sharedRefs.pitch.current
    camera.rotation.z=0
    sharedRefs.pathT.current=0
    sharedRefs.targetT.current=-1
    sharedRefs.autoYaw.current=false
    initialized.current=true
    onReady(built.length)
  },[scene])

  useFrame((_,dt)=>{
    if(!initialized.current||wps.current.length<2) return
    dt=Math.min(dt,0.05)
    const maxT=wps.current.length-1
    if(sharedRefs.targetT.current>=0){
      const diff=sharedRefs.targetT.current-sharedRefs.pathT.current
      sharedRefs.pathT.current+=diff*Math.min(1,2.2*dt)
      sharedRefs.vel.current=0
      if(Math.abs(diff)<0.0005){
        sharedRefs.pathT.current=sharedRefs.targetT.current
        sharedRefs.targetT.current=-1
        sharedRefs.autoYaw.current=false
      }
    } else {
      sharedRefs.pathT.current+=sharedRefs.vel.current
      if(sharedRefs.pathT.current<=0){sharedRefs.pathT.current=0;if(sharedRefs.vel.current<0)sharedRefs.vel.current=0}
      if(sharedRefs.pathT.current>=maxT){sharedRefs.pathT.current=maxT;if(sharedRefs.vel.current>0)sharedRefs.vel.current=0}
      sharedRefs.vel.current*=0.93
      if(Math.abs(sharedRefs.vel.current)<0.000006)sharedRefs.vel.current=0
    }
    camera.position.copy(catmullRomPoint(sharedRefs.pathT.current,wps.current))
    if(sharedRefs.autoYaw.current){
      const py=catmullRomYaw(sharedRefs.pathT.current,wps.current)
      sharedRefs.yaw.current=lerpAngle(sharedRefs.yaw.current,py,Math.min(1,3*dt))
    }
    const cp=Math.max(-Math.PI*.44,Math.min(Math.PI*.44,sharedRefs.pitch.current))
    camera.rotation.order='YXZ'
    camera.rotation.y=sharedRefs.yaw.current
    camera.rotation.x=cp
    camera.rotation.z=0
  })

  return <primitive object={scene} />
}

// ─── Neon corner bracket SVG decorations ───────────────────────────────────
function NeonCorners({ color='#00f5ff', size=28, thick=3 }) {
  const s = `${size}px`
  const corner = (rotate) => (
    <div style={{
      position:'absolute', width:s, height:s,
      transform:`rotate(${rotate}deg)`,
      borderTop:`${thick}px solid ${color}`,
      borderLeft:`${thick}px solid ${color}`,
      filter:`drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})`,
    }}/>
  )
  return (
    <>
      <div style={{position:'absolute',top:0,left:0}}>{corner(0)}</div>
      <div style={{position:'absolute',top:0,right:0}}>{corner(90)}</div>
      <div style={{position:'absolute',bottom:0,right:0}}>{corner(180)}</div>
      <div style={{position:'absolute',bottom:0,left:0}}>{corner(270)}</div>
    </>
  )
}

// ─── Riviera Navbar ─────────────────────────────────────────────────────────
function Navbar({ activeSection, onNav }) {
  const links = ['Home','Schedule','Activities','Sponsors','Gallery','Contact']
  const [menuOpen, setMenuOpen] = useState(false)
  const w = useWindowWidth()
  const isMobile = w <= 500

  const handleNav = (key) => { onNav(key); setMenuOpen(false) }

  return (
    <>
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:200,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 16px',
        height:'52px',
        background:'rgba(8,4,4,0.95)',
        borderBottom:'1px solid rgba(180,20,20,0.18)',
        backdropFilter:'blur(10px)',
      }}>
        {/* Logo */}
        <div style={{
          display:'flex', alignItems:'center', gap:'8px', cursor:'pointer',
        }} onClick={() => handleNav('home')}>
          <svg width='24' height='24' viewBox='0 0 28 28' fill='none'>
            <polygon points='14,2 26,24 2,24' fill='none' stroke='#cc1a1a' strokeWidth='2.2'/>
            <polygon points='14,7 22,21 6,21' fill='#cc1a1a' opacity='0.3'/>
          </svg>
          <span style={{
            color:'#ffffff', fontSize: isMobile ? '0.9rem' : '1.05rem', fontWeight:800,
            fontFamily:"'Rajdhani',sans-serif", letterSpacing:'0.22em',
            textTransform:'uppercase',
            textShadow:'0 0 12px rgba(200,30,30,0.4)',
          }}>RIVIERA</span>
        </div>

        {/* Desktop links */}
        {!isMobile && (
          <div style={{display:'flex', alignItems:'center', gap:'2px'}}>
            {links.map(link => {
              const key = link.toLowerCase()
              const isActive = activeSection === key
              return (
                <button key={link} onClick={() => handleNav(key)} style={{
                  background:'none',
                  border: isActive ? '1px solid rgba(220,50,50,0.55)' : '1px solid transparent',
                  borderRadius:'3px', cursor:'pointer', padding:'5px 16px',
                  color: isActive ? '#ffffff' : 'rgba(255,255,255,0.55)',
                  fontSize:'0.8rem', fontFamily:"'Rajdhani',sans-serif",
                  letterSpacing:'0.06em', fontWeight: isActive ? 600 : 400,
                  transition:'all 0.2s ease', whiteSpace:'nowrap',
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color='rgba(255,255,255,0.85)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color='rgba(255,255,255,0.55)' }}
                >{link}</button>
              )
            })}
          </div>
        )}

      <div style={{display:'flex', flexDirection:'column', gap:'5px', alignItems:'stretch'}}>
        <button style={{
          background:'transparent',
          border:'1px solid rgba(200,40,40,0.6)',
          borderRadius:'3px', padding:'5px 18px',
          color:'rgba(255,255,255,0.85)', fontSize:'0.72rem',
          fontFamily:"'Rajdhani',sans-serif", letterSpacing:'0.1em', fontWeight:600,
          cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
          transition:'all 0.2s ease',
        }}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(200,40,40,0.15)';e.currentTarget.style.borderColor='rgba(200,40,40,0.9)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='rgba(200,40,40,0.6)'}}
          onClick={() => onNav('schedule')}
        >
          ENTER GAMES
          <svg width='9' height='9' viewBox='0 0 10 10' fill='none'>
            <path d='M2 8L8 2M8 2H3M8 2V7' stroke='rgba(255,255,255,0.7)' strokeWidth='1.4' strokeLinecap='round'/>
          </svg>
        </button>

      </div>
    </nav>
    </>
  )
}

// ─── Countdown Box ──────────────────────────────────────────────────────────
function CountdownBox({ time, isMobile }) {
  const pad = n => String(n).padStart(2,'0')
  return (
    <div style={{
      border:'1.5px solid rgba(0,245,255,0.35)',
      borderRadius:'10px',
      background:'linear-gradient(160deg,rgba(0,10,20,0.9),rgba(0,20,30,0.85))',
      padding: isMobile ? '6px 8px' : '18px 22px',
      backdropFilter:'blur(8px)',
      position:'relative',
      boxShadow:'0 0 30px rgba(0,245,255,0.1), inset 0 0 30px rgba(0,0,0,0.5)',
      minWidth: isMobile ? 'auto' : '300px',
      width: isMobile ? '100%' : 'auto',
    }}>
      <NeonCorners color='#00f5ff' size={16} thick={2}/>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:'4px',
      }}>
        <span style={{color:'rgba(0,245,255,0.6)',fontSize:'0.55rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.2em'}}>◉ SYSTEM INTERFACE</span>
        <span style={{color:'#00ff88',fontSize:'0.55rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.12em',
          textShadow:'0 0 8px #00ff88', animation:'blinkDot 1.2s ease-in-out infinite'}}>◈ ACTIVE</span>
      </div>
      <div style={{height:'1px',background:'rgba(0,245,255,0.15)',margin: isMobile ? '5px 0 8px' : '8px 0 14px'}}/>
      <div style={{textAlign:'center',marginBottom: isMobile ? '4px' : '8px'}}>
        <span style={{
          color:'#ffee00', fontSize: isMobile ? '1rem' : '2.6rem', fontWeight:900,
          fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.1em',
          textShadow:'0 0 24px rgba(255,238,0,0.7)',
        }}>
          {pad(time.d)}:{pad(time.h)}:{pad(time.m)}
        </span>
      </div>
      <div style={{display:'flex',justifyContent:'center',gap: isMobile ? '20px' : '38px',marginBottom: isMobile ? '8px' : '14px'}}>
        {['DAYS','HOURS','MINUTES'].map((l,i)=>(
          <span key={i} style={{color:'rgba(255,255,255,0.45)',fontSize:'0.45rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.12em'}}>{l}</span>
        ))}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:'4px'}}>
        <div>
          <div style={{color:'rgba(0,245,255,0.45)',fontSize:'0.48rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.14em',marginBottom:'2px'}}>EVENT DATE</div>
          <div style={{color:'rgba(255,255,255,0.8)',fontSize:'0.6rem',fontFamily:"'Orbitron',sans-serif",fontWeight:600}}>18 - 20 MAY</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{color:'rgba(0,245,255,0.45)',fontSize:'0.48rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.14em',marginBottom:'2px'}}>LOCATION</div>
          <div style={{color:'rgba(255,255,255,0.8)',fontSize:'0.6rem',fontFamily:"'Orbitron',sans-serif",fontWeight:600}}>HIT HALDIA</div>
        </div>
      </div>
      <div style={{display:'flex',gap:'8px',marginTop:'12px'}}>
        {['ENTRY OPEN','PROTOCOL READY'].map((t,i)=>(
          <div key={i} style={{
            flex:1, textAlign:'center',
            border:`1px solid ${i===0?'rgba(0,245,255,0.4)':'rgba(255,0,128,0.4)'}`,
            borderRadius:'4px', padding:'4px',
            color: i===0?'rgba(0,245,255,0.8)':'rgba(255,0,128,0.8)',
            fontSize:'0.5rem', fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.1em',
          }}>{t}</div>
        ))}
      </div>
    </div>
  )
}

// ─── HOME Panel (shown at waypoint 0) ───────────────────────────────────────
function HomePanel({ visible, onEnter, time }) {
  const w = useWindowWidth()
  const isMobile = w <= 500

  if (isMobile) return (
    <div style={{
      position:'fixed', bottom:0, left:0, right:0, zIndex:100,
      pointerEvents: visible ? 'auto' : 'none',
      transition:'opacity 0.6s ease',
      opacity: visible ? 1 : 0,
      display:'flex', flexDirection:'column',
      padding:'12px 10px env(safe-area-inset-bottom, 10px)',
      background:'linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0.88) 25%)',
      transform:'translateZ(0)',
      WebkitTransform:'translateZ(0)',
      willChange:'transform',
    }}>
      <div style={{
        color:'rgba(0,245,255,0.6)', fontSize:'0.38rem',
        fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.22em',
        marginBottom:'5px', textAlign:'center',
      }}>◉ PROTOCOL INITIATED</div>

      <div style={{
        fontFamily:"'Orbitron',sans-serif", fontWeight:900,
        fontSize:'0.85rem', lineHeight:1.0, color:'#ffffff',
        letterSpacing:'0.04em', textAlign:'center',
        textShadow:'0 0 30px rgba(255,255,255,0.2)',
        animation:'titleFlicker 6s ease-in-out infinite',
      }}>RIVIERA FEST</div>

      <div style={{
        fontFamily:"'Orbitron',sans-serif", fontWeight:900,
        fontSize:'0.75rem', lineHeight:1.0, textAlign:'center',
        background:'linear-gradient(90deg,#ff0080,#ff6600)',
        WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
        filter:'drop-shadow(0 0 16px #ff008088)',
        marginBottom:'6px',
      }}>2026</div>

      <div style={{
        color:'rgba(0,245,255,0.8)', fontSize:'0.42rem',
        fontFamily:"'Orbitron',sans-serif", fontWeight:700,
        letterSpacing:'0.18em', marginBottom:'8px', textAlign:'center',
      }}>ENTER THE DIGITAL ARENA</div>

      <CountdownBox time={time} isMobile={true}/>

      <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
        <button onClick={onEnter} style={{
          flex:1,
          background:'linear-gradient(135deg,#ff0080,#cc0066)',
          border:'none', borderRadius:'6px', padding:'5px 0',
          color:'#fff', fontSize:'0.42rem',
          fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.12em', fontWeight:700,
          cursor:'pointer', boxShadow:'0 0 20px rgba(255,0,128,0.4)',
        }}>⚡ ENTER GAMES</button>
        <button style={{
          flex:1,
          background:'transparent', border:'1.5px solid rgba(0,245,255,0.4)',
          borderRadius:'6px', padding:'5px 0',
          color:'rgba(0,245,255,0.85)', fontSize:'0.42rem',
          fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.1em',
          cursor:'pointer',
        }}>◈ PROTOCOL</button>
      </div>

      <div style={{display:'flex',justifyContent:'center',gap:'18px',marginTop:'8px'}}>
        {[['3','DAYS'],['50+','EVENTS'],['10K+','PLAYERS']].map(([val,lbl],i)=>(
          <div key={i} style={{textAlign:'center'}}>
            <div style={{color:'#fff',fontSize:'0.6rem',fontWeight:800,fontFamily:"'Orbitron',sans-serif"}}>{val}</div>
            <div style={{color:'rgba(255,255,255,0.35)',fontSize:'0.3rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.12em'}}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{
      position:'fixed', bottom:0, left:0, right:0, zIndex:100,
      pointerEvents: visible ? 'auto' : 'none',
      transition:'opacity 0.6s ease',
      opacity: visible ? 1 : 0,
      display:'flex', alignItems:'flex-end',
      padding:'20px 40px 32px',
      background: visible ? 'linear-gradient(0deg,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.4) 70%,transparent 100%)' : 'transparent',
      transform:'translateZ(0)',
      WebkitTransform:'translateZ(0)',
      willChange:'transform',
    }}>
      <div style={{flex:1, maxWidth:'520px'}}>
        <div style={{
          color:'rgba(0,245,255,0.7)', fontSize:'0.65rem',
          fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.32em',
          marginBottom:'14px', display:'flex', alignItems:'center', gap:'10px',
        }}>
          <span style={{display:'inline-block',width:'40px',height:'1px',background:'rgba(0,245,255,0.5)'}}/>
          PROTOCOL INITIATED
          <span style={{display:'inline-block',width:'40px',height:'1px',background:'rgba(0,245,255,0.5)'}}/>
        </div>

        <div style={{
          fontFamily:"'Orbitron',sans-serif", fontWeight:900,
          fontSize:'clamp(2.8rem,5vw,4.8rem)',
          lineHeight:1.0, color:'#ffffff', letterSpacing:'0.04em',
          textShadow:'0 0 40px rgba(255,255,255,0.2)', marginBottom:'2px',
          animation:'titleFlicker 6s ease-in-out infinite',
        }}>RIVIERA<br/>FEST</div>

        <div style={{
          fontFamily:"'Orbitron',sans-serif", fontWeight:900,
          fontSize:'clamp(2.4rem,4.5vw,4.2rem)',
          lineHeight:1.0, background:'linear-gradient(90deg,#ff0080,#ff6600)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
          letterSpacing:'0.04em', marginBottom:'18px',
          filter:'drop-shadow(0 0 20px #ff008088)',
        }}>2026</div>

        <div style={{
          color:'rgba(0,245,255,0.9)', fontSize:'0.85rem',
          fontFamily:"'Orbitron',sans-serif", fontWeight:700,
          letterSpacing:'0.26em', marginBottom:'20px',
          textShadow:'0 0 16px #00f5ff66',
        }}>ENTER THE DIGITAL ARENA</div>

        <p style={{
          color:'rgba(255,255,255,0.6)', fontSize:'0.9rem', lineHeight:1.75,
          maxWidth:'420px', marginBottom:'32px', fontFamily:"'Rajdhani',sans-serif",
        }}>
          The arena awaits. A convergence of technology, innovation,
          and relentless competition — where only the extraordinary survive.
          Three days. One protocol. No mercy.
        </p>

        <div style={{display:'flex',gap:'14px',flexWrap:'wrap',marginBottom:'40px'}}>
          <button onClick={onEnter} style={{
            background:'linear-gradient(135deg,#ff0080,#cc0066)',
            border:'none', borderRadius:'6px', padding:'13px 28px',
            color:'#fff', fontSize:'0.72rem',
            fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.18em', fontWeight:700,
            cursor:'pointer', boxShadow:'0 0 28px rgba(255,0,128,0.45)',
            display:'flex', alignItems:'center', gap:'8px', transition:'all 0.25s ease',
          }}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 0 48px rgba(255,0,128,0.7)'}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 0 28px rgba(255,0,128,0.45)'}}
          >
            ENTER THE GAMES <span style={{fontSize:'1rem'}}>→</span>
          </button>
          <button style={{
            background:'transparent', border:'1.5px solid rgba(0,245,255,0.45)',
            borderRadius:'6px', padding:'13px 28px',
            color:'rgba(0,245,255,0.85)', fontSize:'0.72rem',
            fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.18em',
            cursor:'pointer', transition:'all 0.25s ease',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.9)';e.currentTarget.style.color='#00f5ff'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.45)';e.currentTarget.style.color='rgba(0,245,255,0.85)'}}
          >◈ VIEW PROTOCOL</button>
        </div>

        <div style={{display:'flex',gap:'32px'}}>
          {[['3','DAYS'],['50+','EVENTS'],['10K+','PLAYERS']].map(([val,lbl],i)=>(
            <div key={i}>
              <div style={{color:'#ffffff',fontSize:'1.6rem',fontWeight:800,fontFamily:"'Orbitron',sans-serif",textShadow:'0 0 20px rgba(255,255,255,0.3)'}}>{val}</div>
              <div style={{color:'rgba(255,255,255,0.35)',fontSize:'0.55rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.18em'}}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:'16px',alignItems:'flex-end',marginLeft:'auto'}}>
        <CountdownBox time={time} isMobile={false}/>
      </div>
    </div>
  )
}

// ─── Scroll-to-move indicator ────────────────────────────────────────────────
function ScrollIndicator({ visible }) {
  const chevron = (opacity, flip) => (
    <div style={{
      width:'12px', height:'12px',
      borderRight:`2px solid rgba(0,245,255,${opacity})`,
      borderBottom:`2px solid rgba(0,245,255,${opacity})`,
      transform: flip ? 'rotate(225deg)' : 'rotate(45deg)',
    }}/>
  )
  return (
    <div style={{
      position:'fixed', bottom:'28px', left:'50%',
      transform:'translateX(-50%)',
      zIndex:150, pointerEvents:'none',
      display:'flex', flexDirection:'column', alignItems:'center', gap:'5px',
      opacity: visible ? 1 : 0,
      transition:'opacity 0.5s ease',
    }}>
      {/* up arrows */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'-2px',animation:'arrowUp 1.5s ease-in-out infinite'}}>
        {chevron(0.3, true)}
        {chevron(0.6, true)}
      </div>

      {/* mouse icon */}
      <svg width='20' height='32' viewBox='0 0 20 32' fill='none' style={{margin:'2px 0'}}>
        <rect x='1' y='1' width='18' height='26' rx='9' stroke='rgba(0,245,255,0.55)' strokeWidth='1.5'/>
        <rect x='8' y='5' width='4' height='7' rx='2' fill='rgba(0,245,255,0.8)'
          style={{animation:'scrollWheel 1.5s ease-in-out infinite'}}/>
      </svg>

      {/* label */}
      <span style={{
        color:'rgba(0,245,255,0.7)', fontSize:'0.58rem',
        fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.2em', fontWeight:600,
        textShadow:'0 0 10px rgba(0,245,255,0.4)',
        whiteSpace:'nowrap',
      }}>SCROLL TO MOVE</span>

      {/* down arrows */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',animation:'arrowDown 1.5s ease-in-out infinite'}}>
        {chevron(0.6, false)}
        {chevron(0.3, false)}
      </div>
    </div>
  )
}

// ─── Progress Filler Bar (shown when at a section waypoint) ─────────────────
function FillerBar({ progress, label }) {
  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, zIndex:190,
      padding:'0 0 0 0',
    }}>
      <div style={{
        height:'3px',
        background:'rgba(0,245,255,0.08)',
        position:'relative', overflow:'hidden',
      }}>
        <div style={{
          position:'absolute', top:0, left:0,
          height:'100%',
          width:`${progress*100}%`,
          background:'linear-gradient(90deg,#00f5ff,#ff0080)',
          boxShadow:'0 0 12px rgba(0,245,255,0.8)',
          transition:'width 0.3s ease',
        }}/>
      </div>
    </div>
  )
}

// ─── Full-screen Section Panel ───────────────────────────────────────────────
function SectionPanel({ section, visible, scrollsLeft }) {
  const absorbed = SCROLL_THRESHOLD - scrollsLeft
  const pw = useWindowWidth()
  const isMobile = pw <= 500
  const [isOpen,      setIsOpen]      = useState(false)
  const [closing,     setClosing]     = useState(false)
  const [shownSection,setShownSection]= useState(section)

  useEffect(() => {
    if (visible && section) {
      setShownSection(section)
      setClosing(false)
      setIsOpen(true)
    } else if (isOpen) {
      setClosing(true)
      const t = setTimeout(() => { setIsOpen(false); setClosing(false) }, 520)
      return () => clearTimeout(t)
    }
  }, [visible, section])

  if (!isOpen && !closing) return null

  const panels = {
    schedule: <ScheduleContent />,
    activities: <ActivitiesContent />,
    sponsors: <SponsorsContent />,
    gallery: <GalleryContent />,
    gallery2: <Gallery2Content />,
    gallery3: <Gallery3Content />,
    contact: <ContactContent />,
  }

  const titles = {
    schedule: { tag:'COMBAT LOG', title:'SCHEDULE' },
    activities: { tag:'COMBAT DOMAINS', title:'ACTIVITIES' },
    sponsors: { tag:'STRATEGIC ALLIES', title:'SPONSORS' },
    gallery: { tag:'SECTOR—01', title:'CRIMSON STAGE 2025' },
    gallery2: { tag:'SECTOR—02', title:'NON-COMBAT OPERATIONS' },
    gallery3: { tag:'SECTOR—03', title:'FINAL DOMAIN' },
    contact: { tag:'COMMUNICATIONS', title:'CONTACT US' },
  }
  const info = titles[shownSection] || { tag:'', title:'' }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:100,
      display:'flex', alignItems:'center', justifyContent:'center',
      pointerEvents: closing ? 'none' : 'auto',
      padding: isMobile ? '54px 6px 6px' : '64px 40px 56px',
      animation: closing ? 'overlayClose 0.52s ease forwards' : 'overlayOpen 0.38s ease forwards',
    }}>
      <div style={{
        width:'100%', maxWidth:'1060px',
        maxHeight: isMobile ? 'calc(100vh - 70px)' : 'calc(100vh - 124px)',
        background:'linear-gradient(150deg,rgba(0,4,14,0.99) 0%,rgba(0,12,26,0.98) 55%,rgba(0,6,16,0.99) 100%)',
        borderRadius:'3px',
        border:'1.5px solid rgba(0,245,255,0.55)',
        boxShadow:`
          0 0 0 1px rgba(0,245,255,0.07),
          0 0 60px rgba(0,245,255,0.14),
          0 0 130px rgba(0,245,255,0.06),
          0 30px 80px rgba(0,0,0,0.8),
          inset 0 0 120px rgba(0,0,0,0.65)
        `,
        position:'relative',
        overflow:'hidden',
        display:'flex', flexDirection:'column',
        animation: closing
          ? 'panelClose 0.52s cubic-bezier(0.4,0,1,1) forwards'
          : 'panelOpen  0.46s cubic-bezier(0,0,0.2,1) forwards',
      }}>

        {/* Circuit / grid background */}
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none', zIndex:0,
          backgroundImage:`
            repeating-linear-gradient(0deg,  transparent, transparent 47px, rgba(0,245,255,0.04) 47px, rgba(0,245,255,0.04) 48px),
            repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(0,245,255,0.04) 47px, rgba(0,245,255,0.04) 48px)
          `,
          animation:'gridPulse 4s ease-in-out infinite',
        }}/>

        {/* Radial glow center */}
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none', zIndex:0,
          background:'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(0,245,255,0.04) 0%, transparent 70%)',
        }}/>

        {/* Opening scan sweep */}
        {!closing && (
          <div style={{
            position:'absolute', left:0, right:0, height:'4px', zIndex:20,
            background:'linear-gradient(90deg,transparent 5%,rgba(0,245,255,0.7) 35%,rgba(255,0,128,0.5) 50%,rgba(0,245,255,0.7) 65%,transparent 95%)',
            boxShadow:'0 0 18px rgba(0,245,255,0.8)',
            animation:'scanSweep 0.65s ease-out forwards',
            pointerEvents:'none',
          }}/>
        )}

        {/* Big corner brackets */}
        {[
          {top:0,    left:0,  borderTop:'2.5px solid #00f5ff', borderLeft:'2.5px solid #00f5ff'},
          {top:0,    right:0, borderTop:'2.5px solid #00f5ff', borderRight:'2.5px solid #00f5ff'},
          {bottom:0, left:0,  borderBottom:'2.5px solid #00f5ff', borderLeft:'2.5px solid #00f5ff'},
          {bottom:0, right:0, borderBottom:'2.5px solid #00f5ff', borderRight:'2.5px solid #00f5ff'},
        ].map((s,i)=>(
          <div key={i} style={{
            position:'absolute', width:'56px', height:'56px', zIndex:10, ...s,
            animation:'cornerPulse 2.8s ease-in-out infinite',
            animationDelay:`${i*0.18}s`,
          }}/>
        ))}

        {/* Inner corner dots */}
        {[
          {top:'57px',  left:'57px'},
          {top:'57px',  right:'57px'},
          {bottom:'57px',left:'57px'},
          {bottom:'57px',right:'57px'},
        ].map((s,i)=>(
          <div key={i} style={{
            position:'absolute', width:'4px', height:'4px', borderRadius:'50%',
            background:'#00f5ff', zIndex:10, ...s,
            boxShadow:'0 0 8px #00f5ff, 0 0 16px rgba(0,245,255,0.6)',
            animation:'dotBlink 2.5s ease-in-out infinite',
            animationDelay:`${i*0.22}s`,
          }}/>
        ))}

        {/* Top scan bar */}
        <div style={{
          height:'3px', flexShrink:0, zIndex:5, position:'relative',
          background:'linear-gradient(90deg,transparent 0%,#00f5ff 25%,#ff0080 50%,#00f5ff 75%,transparent 100%)',
          backgroundSize:'300% 100%',
          animation:'topBarScan 2.5s linear infinite',
          boxShadow:'0 0 16px rgba(0,245,255,0.7)',
        }}/>

        {/* Header */}
        <div style={{
          padding: isMobile ? '6px 10px 6px' : '16px 52px 14px', position:'relative', zIndex:5,
          borderBottom:'1px solid rgba(0,245,255,0.1)',
          flexShrink:0,
          display:'flex', alignItems:'flex-start', justifyContent:'space-between',
          background:'linear-gradient(90deg,rgba(0,245,255,0.03) 0%,transparent 60%)',
        }}>
          <div>
            <div style={{
              color:'rgba(0,245,255,0.55)', fontSize:'0.46rem',
              fontFamily:"'Orbitron',sans-serif", letterSpacing: isMobile ? '0.2em' : '0.38em',
              marginBottom: isMobile ? '4px' : '8px', display:'flex', alignItems:'center', gap:'8px',
            }}>
              {!isMobile && <span style={{display:'inline-block',width:'28px',height:'1px',background:'rgba(0,245,255,0.45)'}}/>}
              ◈ {info.tag} ◈
              {!isMobile && <span style={{display:'inline-block',width:'28px',height:'1px',background:'rgba(0,245,255,0.45)'}}/>}
            </div>
            <h2 style={{
              color:'#00f5ff', margin:0,
              fontSize: isMobile ? '0.8rem' : 'clamp(1.7rem,3.2vw,2.5rem)',
              fontWeight:900,
              fontFamily:"'Orbitron',sans-serif",
              letterSpacing:'0.1em',
              animation:'titleGlitch 8s ease-in-out infinite',
            }}>{info.title}</h2>
          </div>

          {/* Scroll counter */}
          <div style={{display:'flex',gap:'5px',alignItems:'center',flexShrink:0,paddingTop: isMobile ? '4px' : '10px'}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{
                width: i<absorbed?'30px':'10px', height:'10px',
                borderRadius:'99px',
                background: i<absorbed?'linear-gradient(90deg,#00f5ff,#ff0080)':'rgba(0,245,255,0.08)',
                border:'1px solid rgba(0,245,255,0.28)',
                transition:'all 0.45s cubic-bezier(0,0,0.2,1)',
                boxShadow: i<absorbed?'0 0 14px rgba(0,245,255,0.75)':'none',
              }}/>
            ))}
            <span style={{
              color:'rgba(0,245,255,0.4)', fontSize:'0.48rem',
              fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.13em', marginLeft:'10px',
              whiteSpace:'nowrap',
            }}>
              {scrollsLeft>0 ? `${scrollsLeft} TO ADVANCE` : 'SCROLL ›'}
            </span>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{flex:1, minHeight:0, overflowY:'auto', padding: isMobile ? '6px 8px 10px' : '22px 52px 36px', position:'relative', zIndex:5}}>
          {panels[shownSection]}
        </div>

        {/* Footer progress */}
        <div style={{
          padding: isMobile ? '6px 14px 8px' : '8px 52px 12px', flexShrink:0, zIndex:5, position:'relative',
          borderTop:'1px solid rgba(0,245,255,0.08)',
          background:'rgba(0,0,0,0.55)',
          display:'flex', alignItems:'center', gap:'16px',
        }}>
          <div style={{flex:1,height:'2px',borderRadius:'99px',background:'rgba(0,245,255,0.06)',overflow:'hidden'}}>
            <div style={{
              height:'100%', borderRadius:'99px',
              width:`${Math.min(100,(absorbed/3)*100)}%`,
              background:'linear-gradient(90deg,#00f5ff,#ff0080)',
              transition:'width 0.45s ease',
              boxShadow:'0 0 14px rgba(0,245,255,0.85)',
            }}/>
          </div>
          <span style={{
            color:'rgba(0,245,255,0.3)', fontSize:'0.44rem',
            fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.18em',
            whiteSpace:'nowrap', flexShrink:0,
          }}>◉ RIVIERA 2026</span>
        </div>

        {/* Bottom scan bar */}
        <div style={{
          height:'3px', flexShrink:0, zIndex:5,
          background:'linear-gradient(90deg,transparent 0%,rgba(0,245,255,0.5) 30%,rgba(255,0,128,0.4) 50%,rgba(0,245,255,0.5) 70%,transparent 100%)',
          boxShadow:'0 0 10px rgba(0,245,255,0.4)',
        }}/>
      </div>
    </div>
  )
}

// ─── Schedule Content ────────────────────────────────────────────────────────
function ScheduleContent() {
  const [day, setDay] = useState(0)
  const days = ['SECTOR 01','SECTOR 02','FINAL PHASE']
  const events = [
    [
      { time:'09:00', title:'Digital Combat', desc:'Enter the arena where strategy, skill, and survival instincts collide in a brutal gaming showdown.', num:'01', venue:'Checkpoint 01', seats:'Sector PM' },
      { time:'11:00', title:'Hidden Protocol R-I', desc:'Navigate through layers of mystery and deception — the first elimination round begins.', num:'02', venue:'Checkpoint 01', seats:'Sector PM' },
      { time:'14:00', title:'Crimson Runway', desc:'Style meets danger on the stage where fashion becomes a weapon of self-expression.', num:'03', venue:'Checkpoint 01', seats:'Sector PM' },
    ],
    [
      { time:'07:54', title:'Opening Protocol', desc:'The games are formally declared active — the culling begins now.', num:'01', venue:'Checkpoint 01', seats:'Sector PM' },
      { time:'07:30', title:'Synchronized Assault', desc:'Coordinated movement, relentless energy — the stage trembles under collective force.', num:'02', venue:'Checkpoint 01', seats:'Sector PM' },
      { time:'09:00', title:'Open Domain', desc:'Raw talent, unfiltered voices — step into the arena and claim your moment.', num:'03', venue:'Checkpoint 01', seats:'Sector PM' },
    ],
    [
      { time:'07:30', title:'Hidden Protocol — Final', desc:'The last survivors face the ultimate treasure pursuit. No second chances.', num:'01', venue:'Checkpoint 01', seats:'Sector PM' },
      { time:'14:30', title:'Digital Combat — Finals', desc:'Championship combat. The strongest players battle for the title.', num:'02', venue:'Checkpoint 01', seats:'Sector PM' },
      { time:'20:00', title:'Crimson Stage', desc:'The grand cultural showdown — where art, music, and performance ignite the final night.', num:'03', venue:'Checkpoint 01', seats:'Sector PM' },
    ],
  ]
  return (
    <div>
      <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
        {days.map((d,i)=>(
          <button key={i} onClick={()=>setDay(i)} style={{
            background: day===i ? 'rgba(255,0,128,0.15)' : 'transparent',
            border: day===i ? '1.5px solid rgba(255,0,128,0.6)' : '1.5px solid rgba(0,245,255,0.2)',
            borderRadius:'4px', padding:'6px 16px',
            color: day===i ? '#ff0080' : 'rgba(255,255,255,0.45)',
            fontSize:'0.58rem', fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.14em',
            cursor:'pointer',
            boxShadow: day===i ? '0 0 16px rgba(255,0,128,0.25)' : 'none',
            transition:'all 0.25s ease',
          }}>◈ {d}</button>
        ))}
      </div>
      <div style={{display:'flex',gap:'10px',flexDirection:'column'}}>
        {events[day].map((ev,i)=>(
          <div key={i} style={{
            display:'flex', gap:'14px', alignItems:'flex-start',
            padding:'12px 14px',
            border:'1px solid rgba(0,245,255,0.12)',
            borderRadius:'4px',
            background: i%2===0 ? 'rgba(0,245,255,0.03)' : 'rgba(255,0,128,0.03)',
            animation:`revealUp 0.4s ${i*0.08}s both`,
            position:'relative',
          }}>
            <div style={{
              width:'36px',height:'36px',borderRadius:'4px',flexShrink:0,
              background:'rgba(0,245,255,0.08)',
              border:'1px solid rgba(0,245,255,0.25)',
              display:'flex',alignItems:'center',justifyContent:'center',
              color:'rgba(0,245,255,0.7)',fontSize:'0.7rem',
              fontFamily:"'Orbitron',sans-serif",fontWeight:700,
            }}>{ev.num}</div>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'3px'}}>
                <span style={{color:'rgba(0,245,255,0.5)',fontSize:'0.55rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em'}}>ACTIVATION — {ev.time}</span>
              </div>
              <div style={{color:'#ffffff',fontSize:'0.95rem',fontFamily:"'Rajdhani',sans-serif",fontWeight:700,letterSpacing:'0.04em',marginBottom:'3px',textTransform:'uppercase'}}>{ev.title}</div>
              <div style={{color:'rgba(255,255,255,0.5)',fontSize:'0.75rem',fontFamily:"'Rajdhani',sans-serif",lineHeight:1.4,marginBottom:'6px'}}>{ev.desc}</div>
              <div style={{display:'flex',gap:'14px'}}>
                <span style={{color:'rgba(0,245,255,0.45)',fontSize:'0.55rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.08em'}}>◉ {ev.venue}</span>
                <span style={{color:'rgba(255,0,128,0.45)',fontSize:'0.55rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.08em'}}>◈ {ev.seats}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Activities Content ──────────────────────────────────────────────────────
function ActivitiesContent() {
  const activities = [
    { sector:'RECON-01', tag:'RECON', icon:'◉', name:'Hidden Protocol', desc:'Navigate a web of encoded clues across the arena. Decode, pursue, and outmaneuver rival squads in a high-stakes survival pursuit.', status:'ACTIVE' },
    { sector:'PERFORMANCE-02', tag:'PERFORMANCE', icon:'♪', name:'Crimson Stage', desc:'Where performance becomes a weapon. Electrifying acts under crimson lights in the most intense cultural showdown.', status:'ACTIVE' },
    { sector:'COMBAT-03', tag:'DIGITAL', icon:'⚙', name:'Digital Combat', desc:'Enter the digital battlefield. Only reflexes, strategy, and ruthless precision will determine the survivors.', status:'ACTIVE' },
  ]
  return (
    <div>
      <div style={{textAlign:'center',marginBottom:'22px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.3em',marginBottom:'8px'}}>◈ COMBAT DOMAINS ◈</div>
        <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif"}}>Each domain is a unique trial of skill, strategy, and survival. Choose your battlefield wisely.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px'}}>
        {activities.map((a,i)=>(
          <div key={i} style={{
            padding:'22px 18px', borderRadius:'4px',
            border:'1px solid rgba(0,245,255,0.15)',
            background:'linear-gradient(160deg,rgba(0,10,20,0.8),rgba(0,5,15,0.6))',
            position:'relative', overflow:'hidden',
            animation:`revealUp 0.4s ${i*0.1}s both`,
            transition:'all 0.3s ease',
            cursor:'default',
            display:'flex', flexDirection:'column',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.4)';e.currentTarget.style.background='linear-gradient(160deg,rgba(0,20,35,0.9),rgba(0,10,25,0.8))'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.15)';e.currentTarget.style.background='linear-gradient(160deg,rgba(0,10,20,0.8),rgba(0,5,15,0.6))'}}
          >
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px'}}>
              <span style={{color:'rgba(0,245,255,0.35)',fontSize:'0.52rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em'}}>{a.sector}</span>
              <span style={{
                color:'#00ff88', fontSize:'0.48rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em',
                border:'1px solid rgba(0,255,136,0.3)',borderRadius:'3px',padding:'1px 5px',
              }}>◉ ACTIVE</span>
            </div>
            <div style={{fontSize:'1.8rem',marginBottom:'10px',filter:'drop-shadow(0 0 10px rgba(0,245,255,0.6))'}}>{a.icon}</div>
            <div style={{color:'#ffffff',fontSize:'1.1rem',fontFamily:"'Rajdhani',sans-serif",fontWeight:700,letterSpacing:'0.06em',marginBottom:'8px',textTransform:'uppercase'}}>{a.name}</div>
            <div style={{color:'rgba(255,255,255,0.5)',fontSize:'0.8rem',fontFamily:"'Rajdhani',sans-serif",lineHeight:1.5,marginBottom:'18px',flex:1}}>{a.desc}</div>
            <button style={{
              background:'transparent',border:'1px solid rgba(0,245,255,0.3)',
              borderRadius:'3px',padding:'6px 12px',
              color:'rgba(0,245,255,0.7)',fontSize:'0.52rem',
              fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.12em',
              cursor:'pointer',width:'100%',
            }}>ACCESS DOMAIN →</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sponsors Content ────────────────────────────────────────────────────────
function SponsorsContent() {
  const sponsors = [
    { tier:'TIER—ALPHA', name:'Sprite', bg:'#00a651', text:'#ffffff', fontStyle:'italic', fontFamily:'Georgia,serif', status:'ACTIVE' },
    { tier:'TIER—ALPHA', name:'Coca-Cola', bg:'#e61c24', text:'#ffffff', fontStyle:'italic', fontFamily:'Georgia,serif', status:'ACTIVE' },
    { tier:'TIER—BRAVO', name:'Fanta', bg:'#ff6b00', text:'#ffffff', fontStyle:'normal', fontFamily:"'Orbitron',sans-serif", status:'ACTIVE' },
    { tier:'TIER—BRAVO', name:'Pepsi', bg:'#004b93', text:'#ffffff', fontStyle:'normal', fontFamily:"'Orbitron',sans-serif", status:'ACTIVE' },
  ]
  return (
    <div>
      <div style={{textAlign:'center',marginBottom:'28px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.3em',marginBottom:'8px'}}>◈ STRATEGIC ALLIES ◈</div>
        <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif"}}>Organizations powering the games from behind the line.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'14px'}}>
        {sponsors.map((sp,i)=>(
          <div key={i} style={{
            border:'1px solid rgba(255,255,255,0.12)',
            borderRadius:'6px',
            overflow:'hidden',
            animation:`revealUp 0.4s ${i*0.1}s both`,
          }}>
            <div style={{
              display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'6px 12px',
              background:'rgba(0,0,0,0.4)',
              borderBottom:'1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{color:'rgba(255,255,255,0.45)',fontSize:'0.5rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.14em'}}>{sp.tier}</span>
              <span style={{color:'#00ff88',fontSize:'0.48rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em'}}>◉ ACTIVE</span>
            </div>
            <div style={{
              padding:'36px 24px',
              background:sp.bg,
              display:'flex',alignItems:'center',justifyContent:'center',
              minHeight:'100px',
            }}>
              <span style={{
                color:sp.text,
                fontSize:'1.6rem',
                fontWeight:700,
                fontFamily:sp.fontFamily,
                fontStyle:sp.fontStyle,
                letterSpacing:'0.02em',
              }}>{sp.name}</span>
            </div>
            <div style={{
              padding:'6px 12px',
              background:'rgba(0,0,0,0.4)',
              borderTop:'1px solid rgba(255,255,255,0.08)',
              display:'flex',justifyContent:'space-between',alignItems:'center',
            }}>
              <span style={{color:'rgba(255,255,255,0.4)',fontSize:'0.5rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em'}}>{sp.name.toUpperCase()}</span>
              <span style={{color:'rgba(255,0,128,0.6)',fontSize:'0.48rem',fontFamily:"'Orbitron',sans-serif"}}>◈ ALLIED</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Gallery Image Grid (reusable) ───────────────────────────────────────────
function GalleryGrid({ images, subtitle }) {
  const [lightbox, setLightbox] = useState(null)
  const [rects, setRects] = useState({})
  const imgRefs = useRef({})

  const openLightbox = (i) => {
    const el = imgRefs.current[i]
    if (el) {
      const r = el.getBoundingClientRect()
      setRects(prev => ({ ...prev, [i]: r }))
    }
    setLightbox(i)
  }

  return (
    <>
      <div style={{marginBottom:'10px'}}>
        <p style={{color:'rgba(255,255,255,0.5)',fontSize:'0.82rem',fontFamily:"'Rajdhani',sans-serif",lineHeight:1.5}}>{subtitle}</p>
      </div>
      <div style={{
        display:'grid',
        gridTemplateColumns:'1fr 1fr',
        gridTemplateRows:'auto auto',
        gap:'8px',
        animation:'revealUp 0.4s 0s both',
      }}>
        {images.map((src, i) => (
          <div
            key={i}
            ref={el => imgRefs.current[i] = el}
            onClick={() => openLightbox(i)}
            style={{
              borderRadius:'4px', overflow:'hidden',
              border:'1px solid rgba(0,245,255,0.2)',
              cursor:'pointer',
              position:'relative',
              aspectRatio:'16/10',
              transition:'transform 0.2s ease, border-color 0.2s ease',
            }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.6)';e.currentTarget.style.transform='scale(1.02)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.2)';e.currentTarget.style.transform='scale(1)'}}
          >
            <img src={src} alt={`img ${i}`} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
            <div style={{
              position:'absolute',bottom:0,left:0,right:0,height:'40%',
              background:'linear-gradient(transparent,rgba(0,0,0,0.6))',
              pointerEvents:'none',
            }}/>
            <div style={{
              position:'absolute',top:'6px',left:'6px',
              background:'rgba(0,0,0,0.55)',border:'1px solid rgba(0,245,255,0.3)',
              borderRadius:'3px',padding:'1px 6px',
              color:'rgba(0,245,255,0.7)',fontSize:'0.48rem',fontFamily:"'Orbitron',sans-serif",
            }}>FILE {String(i+1).padStart(2,'0')}</div>
          </div>
        ))}
      </div>

      {lightbox !== null && (
        <div
          onClick={()=>setLightbox(null)}
          style={{
            position:'fixed',inset:0,zIndex:500,
            background:'rgba(0,0,0,0.88)',
            display:'flex',alignItems:'center',justifyContent:'center',
            animation:'revealUp 0.25s ease both',
            cursor:'zoom-out',
          }}
        >
          <div style={{position:'relative',maxWidth:'88vw',maxHeight:'82vh'}}>
            <img
              src={images[lightbox]}
              alt='expanded'
              style={{
                maxWidth:'100%',maxHeight:'82vh',
                objectFit:'contain',
                borderRadius:'6px',
                border:'1.5px solid rgba(0,245,255,0.4)',
                boxShadow:'0 0 60px rgba(0,245,255,0.15)',
                display:'block',
              }}
            />
            <button
              onClick={e=>{e.stopPropagation();setLightbox(null)}}
              style={{
                position:'absolute',top:'-14px',right:'-14px',
                width:'28px',height:'28px',borderRadius:'50%',
                background:'rgba(0,10,20,0.9)',border:'1px solid rgba(0,245,255,0.4)',
                color:'rgba(0,245,255,0.8)',fontSize:'0.8rem',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',
              }}
            >✕</button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Gallery Content (Sector 1) ───────────────────────────────────────────────
function GalleryContent() {
  const images = [
    '/gallery/s1_1.jpg',
    '/gallery/s1_2.jpg',
    '/gallery/s1_3.jpg',
    '/gallery/s1_4.jpg',
  ]
  return (
    <GalleryGrid
      images={images}
      subtitle="Electrifying performances and relentless energy from the main combat stage."
    />
  )
}

// ─── Gallery2 Content (Sector 2) ─────────────────────────────────────────────
function Gallery2Content() {
  const images = [
    '/gallery/s2_1.jpg',
    '/gallery/s2_2.jpg',
    '/gallery/s2_3.jpg',
    '/gallery/s2_4.jpg',
  ]
  return (
    <GalleryGrid
      images={images}
      subtitle="Tactical creativity, strategic gaming, and high-stakes challenges beyond the digital battlefield."
    />
  )
}

// ─── Gallery3 Content (Sector 3) ─────────────────────────────────────────────
function Gallery3Content() {
  const images = [
    '/gallery/s3_1.jpg',
    '/gallery/s3_2.jpg',
    '/gallery/s3_3.jpg',
    '/gallery/s3_4.jpg',
  ]
  return (
    <GalleryGrid
      images={images}
      subtitle="The crowd ignited as the bass dropped in the final arena showdown."
    />
  )
}

// ─── Contact Content ─────────────────────────────────────────────────────────
function ContactContent() {
  const people = [
    { name:'HARSHITA', phone:'7209593922', photo:'/contact/harshita.jpg' },
    { name:'BIBHUTI BISHAL', phone:'6201371315', photo:'/contact/bibhuti.jpg' },
  ]
  return (
    <div>
      <div style={{textAlign:'center',marginBottom:'28px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.3em',marginBottom:'8px'}}>◈ COMMUNICATIONS ◈</div>
        <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif"}}>Reach the command units directly.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'24px',maxWidth:'560px',margin:'0 auto'}}>
        {people.map((p,i)=>(
          <div key={i} style={{
            border:'1.5px solid rgba(0,245,255,0.25)',
            borderRadius:'8px', overflow:'hidden',
            background:'linear-gradient(160deg,rgba(0,10,20,0.9),rgba(0,5,15,0.7))',
            animation:`revealUp 0.4s ${i*0.15}s both`,
            transition:'all 0.3s ease',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.6)';e.currentTarget.style.boxShadow='0 0 24px rgba(0,245,255,0.15)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.25)';e.currentTarget.style.boxShadow='none'}}
          >
            <div style={{
              position:'relative',
              paddingTop:'100%',
              overflow:'hidden',
              background:'rgba(0,15,30,0.8)',
              borderBottom:'1px solid rgba(0,245,255,0.15)',
            }}>
              <img src={p.photo} alt={p.name} style={{
                position:'absolute',top:0,left:0,
                width:'100%',height:'100%',
                objectFit:'cover',objectPosition:'center top',
                display:'block',
              }}/>
              <div style={{
                position:'absolute',inset:0,
                background:'linear-gradient(transparent 60%,rgba(0,0,0,0.5))',
                pointerEvents:'none',
              }}/>
              <div style={{
                position:'absolute',top:'8px',right:'8px',
                width:'10px',height:'10px',borderRadius:'50%',
                background:'#00ff88',
                boxShadow:'0 0 8px #00ff88',
              }}/>
            </div>
            <div style={{padding:'14px 16px',textAlign:'center'}}>
              <div style={{
                color:'#ffffff',fontSize:'0.95rem',
                fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                letterSpacing:'0.08em',marginBottom:'8px',
                textTransform:'uppercase',
              }}>{p.name}</div>
              <div style={{
                display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',
                border:'1px solid rgba(0,245,255,0.2)',
                borderRadius:'4px',padding:'6px 12px',
                background:'rgba(0,245,255,0.04)',
              }}>
                <span style={{color:'rgba(0,245,255,0.6)',fontSize:'0.75rem'}}>📞</span>
                <span style={{
                  color:'rgba(0,245,255,0.9)',fontSize:'0.78rem',
                  fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.08em',fontWeight:600,
                }}>{p.phone}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
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
  const [loaderVisible, setLoaderVisible] = useState(true)
  const [loaderFading,  setLoaderFading]  = useState(false)
  const [currentWp,   setCurrentWp]   = useState(0)
  const [atHome,      setAtHome]      = useState(true)
  const [activeSection,setActiveSection] = useState(null)
  const [scrollsLeft, setScrollsLeft] = useState(SCROLL_THRESHOLD)
  const [activeNav,   setActiveNav]   = useState('home')

  const scrollLock = useRef({ lockedWpIdx: -1, count: 0 })
  const time = useCountdown()

  useEffect(() => {
    if (!ready) return
    setLoaderFading(true)
    const t = setTimeout(() => setLoaderVisible(false), 950)
    return () => clearTimeout(t)
  }, [ready])

  const getDisplayWpIdx = useCallback((t) => {
    const rounded = Math.round(t)
    if (rounded in SECTION_AT && Math.abs(t - rounded) < 0.28) return rounded
    return -1
  }, [])

  const navigateTo = useCallback((key) => {
    const wp = NAV_WP[key]
    if (wp === undefined) return
    sharedRefs.targetT.current = wp
    sharedRefs.autoYaw.current = false
    const wpData = sharedRefs.wpsRef.current[wp]
    if (wpData) {
      sharedRefs.yaw.current = wpData.yaw
      sharedRefs.pitch.current = -0.04
    }
    scrollLock.current = { lockedWpIdx: -1, count: 0 }
    setScrollsLeft(SCROLL_THRESHOLD)
    setActiveNav(key)
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
    const dragState = { active:false, x:0, y:0 }
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
      sharedRefs.vel.current += dy * 0.000022
      sharedRefs.yaw.current -= dx * 0.0022
    }
    const onTouchEnd = () => { dragState.active = false }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove',  onTouchMove,  { passive: true })
    window.addEventListener('touchend',   onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove',  onTouchMove)
      window.removeEventListener('touchend',   onTouchEnd)
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
      sharedRefs.autoYaw.current = true
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
      const rounded = Math.round(t)
      const near = Math.abs(t - rounded) < 0.28

      const isHome = t < 0.5
      setAtHome(isHome)

      if (isHome) setActiveNav('home')
      else if (near && rounded in NAV_WP) {
        const k = Object.keys(NAV_WP).find(k => NAV_WP[k] === rounded)
        if (k) setActiveNav(k)
      }

      const wpIdx = getDisplayWpIdx(t)
      setCurrentWp(rounded)
      setActiveSection(wpIdx >= 0 ? SECTION_AT[wpIdx] : null)

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

  const absorbed = SCROLL_THRESHOLD - scrollsLeft
  const fillerProgress = activeSection ? absorbed / SCROLL_THRESHOLD : 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; cursor: crosshair; }
        @keyframes scanLine {
          0% { background-position: -200% 0 }
          100% { background-position: 200% 0 }
        }
        @keyframes glowPulse {
          0%,100% { text-shadow: 0 0 30px rgba(0,245,255,0.6) }
          50% { text-shadow: 0 0 55px rgba(0,245,255,1), 0 0 80px rgba(0,245,255,0.4) }
        }
        @keyframes blinkDot {
          0%,100% { opacity: 1 }
          50% { opacity: 0.3 }
        }
        @keyframes scrollBounce {
          0%,100% { transform: translateY(0) }
          50% { transform: translateY(5px) }
        }
        @keyframes scrollWheel {
          0% { transform: translateY(0); opacity: 1 }
          100% { transform: translateY(6px); opacity: 0 }
        }
        @keyframes arrowDown {
          0%,100% { transform: translateY(0); opacity: 0.5 }
          50% { transform: translateY(5px); opacity: 1 }
        }
        @keyframes arrowUp {
          0%,100% { transform: translateY(0); opacity: 0.5 }
          50% { transform: translateY(-5px); opacity: 1 }
        }
        @keyframes revealUp {
          from { opacity: 0; transform: translateY(14px) }
          to { opacity: 1; transform: translateY(0) }
        }
        @keyframes titleFlicker {
          0%,96%,100% { opacity: 1 }
          97% { opacity: 0.85 }
          98% { opacity: 1 }
          99% { opacity: 0.9 }
        }
        @keyframes mobileMenuOpen {
          from { opacity:0; transform:translateY(-8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-thumb { background: rgba(0,245,255,0.25); border-radius: 4px }
        ::-webkit-scrollbar-track { background: transparent }
      `}</style>

      <Switch2DBar />
      <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, overflow:'hidden', background:'#030a0f', transform:'translateZ(0)', WebkitTransform:'translateZ(0)' }}>
        <CanvasErrorBoundary>
          <Canvas
            camera={{ fov:65, near:1, far:9000000 }}
            gl={{ antialias:true }}
            style={{ width:'100%', height:'100%', display:'block' }}
            onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace }}
          >
            <color attach="background" args={['#030a12']} />
            <ambientLight intensity={1.4} />
            <directionalLight position={[2000,5000,3000]} intensity={1.8} />
            <hemisphereLight args={['#0a1a3a','#1a3010',0.55]} />
            <Suspense fallback={null}>
              <Scene sharedRefs={sharedRefs} onReady={n => { setNumWps(n); setReady(true) }} />
            </Suspense>
          </Canvas>
        </CanvasErrorBoundary>

        {loaderVisible && <LoadingScreen fading={loaderFading} />}
        <Navbar activeSection={activeNav} onNav={navigateTo} />
        <FillerBar progress={fillerProgress} label={activeSection} />
        <HomePanel
          visible={atHome && !activeSection}
          onEnter={() => navigateTo('schedule')}
          time={time}
        />
        <ScrollIndicator visible={true} />
        {ready && (
          <SectionPanel
            section={activeSection}
            visible={!!activeSection}
            scrollsLeft={scrollsLeft}
          />
        )}
      </div>
    </>
  )
}
