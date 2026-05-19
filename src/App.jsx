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
const NAV_WP = { home:0, schedule:1, activities:2, sponsors:3, gallery:4, contact:10 }

// Section panels shown at these waypoint indices
const SECTION_AT = {
  1: 'schedule',
  2: 'activities',
  3: 'sponsors',
  4: 'gallery',
  10: 'contact',
}

// How many scrolls to fill before advancing
const SCROLL_THRESHOLD = 3

// Touch controls
const TOUCH_MOVE_SENSITIVITY  = 0.000014
const TOUCH_LOOK_SENSITIVITY  = 0.0018
const FLICK_VELOCITY_SCALE    = 0.45
const DIRECTION_LOCK_PX       = 12

// ─── Target date for countdown (change as needed) ─────────────────────────
const EVENT_DATE = new Date('2026-05-18T00:00:00')

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
        position:'fixed', top:'52px', right:'24px',
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
    sharedRefs.pitch.current = 0
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
  return (
    <nav style={{
      position:'fixed', top:0, left:0, right:0, zIndex:200,
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 24px',
      height:'52px',
      background:'rgba(8,4,4,0.92)',
      borderBottom:'1px solid rgba(180,20,20,0.18)',
      backdropFilter:'blur(10px)',
    }}>
      <div style={{
        display:'flex', alignItems:'center', gap:'8px',
        cursor:'pointer',
      }} onClick={() => onNav('home')}>
        <div style={{
          width:'28px', height:'28px',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width='28' height='28' viewBox='0 0 28 28' fill='none'>
            <polygon points='14,2 26,24 2,24' fill='none' stroke='#cc1a1a' strokeWidth='2.2'/>
            <polygon points='14,7 22,21 6,21' fill='#cc1a1a' opacity='0.3'/>
          </svg>
        </div>
        <span style={{
          color:'#ffffff', fontSize:'1.05rem', fontWeight:800,
          fontFamily:"'Rajdhani',sans-serif", letterSpacing:'0.22em',
          textTransform:'uppercase',
          textShadow:'0 0 12px rgba(200,30,30,0.4)',
        }}>RIVIERA</span>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:'2px'}}>
        {links.map(link => {
          const key = link.toLowerCase()
          const isActive = activeSection === key
          return (
            <button key={link} onClick={() => onNav(key)} style={{
              background:'none',
              border: isActive ? '1px solid rgba(220,50,50,0.55)' : '1px solid transparent',
              borderRadius:'3px',
              cursor:'pointer',
              padding:'5px 16px',
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.55)',
              fontSize:'0.8rem',
              fontFamily:"'Rajdhani',sans-serif",
              letterSpacing:'0.06em',
              fontWeight: isActive ? 600 : 400,
              transition:'all 0.2s ease',
              whiteSpace:'nowrap',
            }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
            >
              {link}
            </button>
          )
        })}
      </div>

      <button style={{
        background:'transparent',
        border:'1px solid rgba(200,40,40,0.6)',
        borderRadius:'3px', padding:'7px 18px',
        color:'rgba(255,255,255,0.85)', fontSize:'0.72rem',
        fontFamily:"'Rajdhani',sans-serif", letterSpacing:'0.1em', fontWeight:600,
        cursor:'pointer',
        display:'flex', alignItems:'center', gap:'6px',
        transition:'all 0.2s ease',
      }}
        onMouseEnter={e=>{e.currentTarget.style.background='rgba(200,40,40,0.15)';e.currentTarget.style.borderColor='rgba(200,40,40,0.9)'}}
        onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='rgba(200,40,40,0.6)'}}
        onClick={() => onNav('schedule')}
      >
        ENTER GAMES
        <svg width='10' height='10' viewBox='0 0 10 10' fill='none'>
          <path d='M2 8L8 2M8 2H3M8 2V7' stroke='rgba(255,255,255,0.7)' strokeWidth='1.4' strokeLinecap='round'/>
        </svg>
      </button>
    </nav>
  )
}

// ─── Countdown Box ──────────────────────────────────────────────────────────
function CountdownBox({ time }) {
  const pad = n => String(n).padStart(2,'0')
  return (
    <div style={{
      border:'1.5px solid rgba(0,245,255,0.35)',
      borderRadius:'10px',
      background:'linear-gradient(160deg,rgba(0,10,20,0.9),rgba(0,20,30,0.85))',
      padding:'18px 22px',
      backdropFilter:'blur(8px)',
      position:'relative',
      boxShadow:'0 0 30px rgba(0,245,255,0.1), inset 0 0 30px rgba(0,0,0,0.5)',
      minWidth:'300px',
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
      <div style={{height:'1px',background:'rgba(0,245,255,0.15)',margin:'8px 0 14px'}}/>
      <div style={{textAlign:'center',marginBottom:'8px'}}>
        <span style={{
          color:'#ffee00', fontSize:'2.6rem', fontWeight:900,
          fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.1em',
          textShadow:'0 0 24px rgba(255,238,0,0.7)',
        }}>
          {pad(time.d)}:{pad(time.h)}:{pad(time.m)}
        </span>
      </div>
      <div style={{display:'flex',justifyContent:'center',gap:'38px',marginBottom:'14px'}}>
        {['DAYS','HOURS','MINUTES'].map((l,i)=>(
          <span key={i} style={{color:'rgba(255,255,255,0.45)',fontSize:'0.52rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.16em'}}>{l}</span>
        ))}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:'4px'}}>
        <div>
          <div style={{color:'rgba(0,245,255,0.45)',fontSize:'0.48rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.14em',marginBottom:'2px'}}>EVENT DATE</div>
          <div style={{color:'rgba(255,255,255,0.8)',fontSize:'0.6rem',fontFamily:"'Orbitron',sans-serif",fontWeight:600}}>18 - 20 MAY</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{color:'rgba(0,245,255,0.45)',fontSize:'0.48rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.14em',marginBottom:'2px'}}>LOCATION</div>
          <div style={{color:'rgba(255,255,255,0.8)',fontSize:'0.6rem',fontFamily:"'Orbitron',sans-serif",fontWeight:600}}>NIT HALDIA</div>
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
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:100,
      pointerEvents: visible ? 'auto' : 'none',
      transition:'opacity 0.6s ease',
      opacity: visible ? 1 : 0,
      display:'flex', alignItems:'center',
      padding:'30px 60px 40px',
      background: visible ? 'linear-gradient(90deg,rgba(0,0,0,0.72) 45%,rgba(0,0,0,0.2) 100%)' : 'transparent',
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
          lineHeight:1.0,
          color:'#ffffff',
          letterSpacing:'0.04em',
          textShadow:'0 0 40px rgba(255,255,255,0.2)',
          marginBottom:'2px',
          animation:'titleFlicker 6s ease-in-out infinite',
        }}>RIVIERA<br/>FEST</div>

        <div style={{
          fontFamily:"'Orbitron',sans-serif", fontWeight:900,
          fontSize:'clamp(2.4rem,4.5vw,4.2rem)',
          lineHeight:1.0,
          background:'linear-gradient(90deg,#ff0080,#ff6600)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
          letterSpacing:'0.04em',
          textShadow:'none',
          marginBottom:'18px',
          filter:'drop-shadow(0 0 20px #ff008088)',
        }}>2026</div>

        <div style={{
          color:'rgba(0,245,255,0.9)', fontSize:'0.85rem',
          fontFamily:"'Orbitron',sans-serif", fontWeight:700,
          letterSpacing:'0.26em', marginBottom:'20px',
          textShadow:'0 0 16px #00f5ff66',
        }}>ENTER THE DIGITAL ARENA</div>

        <p style={{
          color:'rgba(255,255,255,0.6)',
          fontSize:'0.9rem', lineHeight:1.75,
          maxWidth:'420px', marginBottom:'32px',
          fontFamily:"'Rajdhani',sans-serif",
        }}>
          The arena awaits. A convergence of technology, innovation,
          and relentless competition — where only the extraordinary survive.
          Three days. One protocol. No mercy.
        </p>

        <div style={{display:'flex',gap:'14px',flexWrap:'wrap',marginBottom:'40px'}}>
          <button onClick={onEnter} style={{
            background:'linear-gradient(135deg,#ff0080,#cc0066)',
            border:'none', borderRadius:'6px',
            padding:'13px 28px',
            color:'#fff', fontSize:'0.72rem',
            fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.18em', fontWeight:700,
            cursor:'pointer',
            boxShadow:'0 0 28px rgba(255,0,128,0.45)',
            display:'flex', alignItems:'center', gap:'8px',
            transition:'all 0.25s ease',
          }}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 0 48px rgba(255,0,128,0.7)'}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 0 28px rgba(255,0,128,0.45)'}}
          >
            ENTER THE GAMES <span style={{fontSize:'1rem'}}>→</span>
          </button>
          <button style={{
            background:'transparent',
            border:'1.5px solid rgba(0,245,255,0.45)',
            borderRadius:'6px', padding:'13px 28px',
            color:'rgba(0,245,255,0.85)', fontSize:'0.72rem',
            fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.18em',
            cursor:'pointer', transition:'all 0.25s ease',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.9)';e.currentTarget.style.color='#00f5ff'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.45)';e.currentTarget.style.color='rgba(0,245,255,0.85)'}}
          >
            ◈ VIEW PROTOCOL
          </button>
        </div>

        <div style={{display:'flex',gap:'32px'}}>
          {[['3','DAYS'],['50+','EVENTS'],['10K+','PLAYERS']].map(([val,lbl],i)=>(
            <div key={i}>
              <div style={{
                color:'#ffffff',fontSize:'1.6rem',fontWeight:800,
                fontFamily:"'Orbitron',sans-serif",
                textShadow:'0 0 20px rgba(255,255,255,0.3)',
              }}>{val}</div>
              <div style={{color:'rgba(255,255,255,0.35)',fontSize:'0.55rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.18em'}}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:'16px',alignItems:'flex-end',marginLeft:'auto'}}>
        <CountdownBox time={time}/>
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

  if (!section) return null

  const panels = {
    schedule: <ScheduleContent />,
    activities: <ActivitiesContent />,
    sponsors: <SponsorsContent />,
    gallery: <GalleryContent />,
    contact: <ContactContent />,
  }

  const titles = {
    schedule: { tag:'COMBAT LOG', title:'SCHEDULE' },
    activities: { tag:'COMBAT DOMAINS', title:'ACTIVITIES' },
    sponsors: { tag:'STRATEGIC ALLIES', title:'SPONSORS' },
    gallery: { tag:'ARCHIVE FEED', title:'GALLERY' },
    contact: { tag:'COMMUNICATIONS', title:'CONTACT US' },
  }
  const info = titles[section] || { tag:'', title:'' }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:100,
      display:'flex', alignItems:'center', justifyContent:'center',
      pointerEvents: visible ? 'auto' : 'none',
      transition:'opacity 0.5s ease',
      opacity: visible ? 1 : 0,
      padding:'70px 40px 60px',
      background:'rgba(0,0,0,0.55)',
      backdropFilter:'blur(3px)',
    }}>
      <style>{`
        @keyframes back3d-pulse{0%,100%{box-shadow:0 0 0 #00e5ff00}50%{box-shadow:0 0 10px #00e5ff66}}
        @keyframes ov-slidein{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
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
        width:'100%', maxWidth:'1000px',
        maxHeight:'calc(100vh - 130px)',
        background:'linear-gradient(160deg,rgba(0,8,16,0.97) 0%,rgba(0,15,25,0.97) 100%)',
        borderRadius:'4px',
        border:'1.5px solid rgba(0,245,255,0.35)',
        boxShadow:'0 0 0 1px rgba(0,245,255,0.08), 0 0 60px rgba(0,245,255,0.12), inset 0 0 80px rgba(0,0,0,0.6)',
        position:'relative',
        overflow:'hidden',
        display:'flex', flexDirection:'column',
      }}>
        <NeonCorners color='#00f5ff' size={32} thick={2.5}/>

        <div style={{
          height:'2px',
          background:'linear-gradient(90deg,transparent,#00f5ff,#ff0080,#00f5ff,transparent)',
          animation:'scanLine 3s linear infinite',
          backgroundSize:'200% 100%',
        }}/>

        <div style={{
          padding:'20px 36px 16px',
          borderBottom:'1px solid rgba(0,245,255,0.1)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          flexShrink:0,
        }}>
          <div>
            <div style={{
              color:'rgba(0,245,255,0.5)', fontSize:'0.52rem',
              fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.3em',
              marginBottom:'4px',
            }}>◈ {info.tag}</div>
            <h2 style={{
              color:'#00f5ff', fontSize:'2rem', fontWeight:900,
              fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.1em',
              margin:0,
              textShadow:'0 0 30px rgba(0,245,255,0.6)',
              animation:'glowPulse 3s ease-in-out infinite',
            }}>{info.title}</h2>
          </div>
          <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{
                width: i<absorbed?'24px':'10px', height:'10px',
                borderRadius:'99px',
                background: i<absorbed?'linear-gradient(90deg,#00f5ff,#ff0080)':'rgba(0,245,255,0.1)',
                border:'1px solid rgba(0,245,255,0.3)',
                transition:'all 0.4s ease',
                boxShadow: i<absorbed?'0 0 10px rgba(0,245,255,0.6)':'none',
              }}/>
            ))}
            <span style={{
              color:'rgba(0,245,255,0.5)', fontSize:'0.52rem',
              fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.16em', marginLeft:'8px',
            }}>
              {scrollsLeft>0 ? `${scrollsLeft} SCROLL${scrollsLeft>1?'S':''} TO ADVANCE` : 'SCROLL TO CONTINUE'}
            </span>
          </div>
        </div>

        <div style={{flex:1, minHeight:0, overflowY:'auto', padding:'24px 36px 48px', position:'relative'}}>
          {panels[section]}
        </div>

        <div style={{
          padding:'10px 36px 14px',
          borderTop:'1px solid rgba(0,245,255,0.1)',
          flexShrink:0,
          background:'rgba(0,0,0,0.4)',
        }}>
          <div style={{height:'2px',borderRadius:'99px',background:'rgba(0,245,255,0.08)',overflow:'hidden'}}>
            <div style={{
              height:'100%',borderRadius:'99px',
              width:`${Math.min(100,(absorbed/3)*100)}%`,
              background:'linear-gradient(90deg,#00f5ff,#ff0080)',
              transition:'width 0.4s ease',
              boxShadow:'0 0 12px rgba(0,245,255,0.7)',
            }}/>
          </div>
        </div>

        <div style={{
          height:'2px',
          background:'linear-gradient(90deg,transparent,#00f5ff,#ff0080,#00f5ff,transparent)',
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
      { time:'09:00', title:'Opening Protocol', desc:'The games are formally declared active — the culling begins now.', num:'01', venue:'Main Arena', seats:'Open' },
      { time:'11:00', title:'Hidden Protocol R-I', desc:'Navigate through layers of mystery and deception — the first elimination round begins.', num:'02', venue:'Zone B', seats:'Limited' },
      { time:'14:00', title:'Crimson Runway', desc:'Style meets danger on the stage where fashion becomes a weapon of self-expression.', num:'03', venue:'Stage C', seats:'Open' },
    ],
    [
      { time:'07:54', title:'Synchronized Assault', desc:'Coordinated movement, relentless energy — the stage trembles under collective force.', num:'01', venue:'Main Arena', seats:'Open' },
      { time:'09:00', title:'Open Domain', desc:'Raw talent, unfiltered voices — step into the arena and claim your moment.', num:'02', venue:'Zone A', seats:'Open' },
      { time:'11:30', title:'Digital Siege', desc:'Hack, strategize, and outlast — the digital battlefield awaits your command.', num:'03', venue:'Cyber Hub', seats:'Limited' },
    ],
    [
      { time:'07:30', title:'Hidden Protocol — Final', desc:'The last survivors face the ultimate treasure pursuit. No second chances.', num:'01', venue:'Zone B', seats:'Finals Only' },
      { time:'14:30', title:'Digital Combat — Finals', desc:'Championship combat. The strongest players battle for the title.', num:'02', venue:'Cyber Hub', seats:'Finals Only' },
      { time:'20:00', title:'Crimson Stage', desc:'The grand cultural showdown — where art, music, and performance ignite the final night.', num:'03', venue:'Main Arena', seats:'Open' },
    ],
  ]
  return (
    <div>
      <div style={{display:'flex',gap:'8px',marginBottom:'22px'}}>
        {days.map((d,i)=>(
          <button key={i} onClick={()=>setDay(i)} style={{
            background: day===i ? 'rgba(255,0,128,0.15)' : 'transparent',
            border: day===i ? '1.5px solid rgba(255,0,128,0.6)' : '1.5px solid rgba(0,245,255,0.2)',
            borderRadius:'4px', padding:'7px 18px',
            color: day===i ? '#ff0080' : 'rgba(255,255,255,0.45)',
            fontSize:'0.6rem', fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.16em',
            cursor:'pointer',
            boxShadow: day===i ? '0 0 16px rgba(255,0,128,0.25)' : 'none',
            transition:'all 0.25s ease',
          }}>◈ {d}</button>
        ))}
      </div>
      <div style={{display:'flex',gap:'18px',flexDirection:'column'}}>
        {events[day].map((ev,i)=>(
          <div key={i} style={{
            display:'flex', gap:'18px', alignItems:'flex-start',
            padding:'16px 18px',
            border:'1px solid rgba(0,245,255,0.12)',
            borderRadius:'4px',
            background: i%2===0 ? 'rgba(0,245,255,0.03)' : 'rgba(255,0,128,0.03)',
            animation:`revealUp 0.4s ${i*0.08}s both`,
            position:'relative',
          }}>
            <div style={{
              width:'42px',height:'42px',borderRadius:'4px',
              background:'rgba(0,245,255,0.08)',
              border:'1px solid rgba(0,245,255,0.25)',
              display:'flex',alignItems:'center',justifyContent:'center',
              color:'rgba(0,245,255,0.7)',fontSize:'0.75rem',
              fontFamily:"'Orbitron',sans-serif",fontWeight:700,
              flexShrink:0,
            }}>{ev.num}</div>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'5px'}}>
                <span style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em'}}>ACTIVATION — {ev.time}</span>
              </div>
              <div style={{color:'#ffffff',fontSize:'1.0rem',fontFamily:"'Rajdhani',sans-serif",fontWeight:700,letterSpacing:'0.04em',marginBottom:'5px',textTransform:'uppercase'}}>{ev.title}</div>
              <div style={{color:'rgba(255,255,255,0.5)',fontSize:'0.8rem',fontFamily:"'Rajdhani',sans-serif",lineHeight:1.5,marginBottom:'8px'}}>{ev.desc}</div>
              <div style={{display:'flex',gap:'14px'}}>
                <span style={{color:'rgba(0,245,255,0.45)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.08em'}}>◉ {ev.venue}</span>
                <span style={{color:'rgba(255,0,128,0.45)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.08em'}}>◈ {ev.seats}</span>
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
    { sector:'TACTICAL-04', tag:'INNOVATION', icon:'◈', name:'Innovation Forge', desc:'A vault of cutting-edge creations and experimental technology. Where visionary minds showcase weapons of innovation.', status:'ACTIVE' },
  ]
  return (
    <div>
      <div style={{textAlign:'center',marginBottom:'22px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.3em',marginBottom:'8px'}}>◈ COMBAT DOMAINS ◈</div>
        <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif"}}>Each domain is a unique trial of skill, strategy, and survival. Choose your battlefield wisely.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'12px'}}>
        {activities.map((a,i)=>(
          <div key={i} style={{
            padding:'16px', borderRadius:'4px',
            border:'1px solid rgba(0,245,255,0.15)',
            background:'linear-gradient(160deg,rgba(0,10,20,0.8),rgba(0,5,15,0.6))',
            position:'relative', overflow:'hidden',
            animation:`revealUp 0.4s ${i*0.05}s both`,
            transition:'all 0.3s ease',
            cursor:'default',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.4)';e.currentTarget.style.background='linear-gradient(160deg,rgba(0,20,35,0.9),rgba(0,10,25,0.8))'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.15)';e.currentTarget.style.background='linear-gradient(160deg,rgba(0,10,20,0.8),rgba(0,5,15,0.6))'}}
          >
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
              <span style={{color:'rgba(0,245,255,0.35)',fontSize:'0.5rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em'}}>{a.sector}</span>
              <span style={{
                color: a.status==='ACTIVE'?'#00ff88':'rgba(255,165,0,0.8)',
                fontSize:'0.48rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em',
                border:`1px solid ${a.status==='ACTIVE'?'rgba(0,255,136,0.3)':'rgba(255,165,0,0.3)'}`,
                borderRadius:'3px',padding:'1px 5px',
              }}>◉ {a.status}</span>
            </div>
            <div style={{fontSize:'1.4rem',marginBottom:'6px',filter:'drop-shadow(0 0 8px rgba(0,245,255,0.5))'}}>{a.icon}</div>
            <div style={{color:'#ffffff',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif",fontWeight:700,letterSpacing:'0.06em',marginBottom:'5px',textTransform:'uppercase'}}>{a.name}</div>
            <div style={{color:'rgba(255,255,255,0.42)',fontSize:'0.72rem',fontFamily:"'Rajdhani',sans-serif",lineHeight:1.45,marginBottom:'10px'}}>{a.desc}</div>
            <button style={{
              background:'transparent',border:'1px solid rgba(0,245,255,0.3)',
              borderRadius:'3px',padding:'4px 10px',
              color:'rgba(0,245,255,0.7)',fontSize:'0.52rem',
              fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.12em',
              cursor:'pointer',width:'100%',
            }}>ENTER SECTOR →</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sponsors Content ────────────────────────────────────────────────────────
function SponsorsContent() {
  const tiers = [
    { name:'TIER—ALPHA', color:'#00f5ff', glow:'rgba(0,245,255,0.4)', sponsors:[
      { name:'Sprite', bg:'#00a651', text:'#ffffff', font:'Georgia,serif', style:'italic' },
      { name:'Coca-Cola', bg:'#e61c24', text:'#ffffff', font:'Georgia,serif', style:'italic' },
    ]},
    { name:'TIER—BRAVO', color:'#ff0080', glow:'rgba(255,0,128,0.4)', sponsors:[
      { name:'FANTA', bg:'#ff6b00', text:'#ffffff', font:"'Orbitron',sans-serif", style:'normal' },
      { name:'PEPSI', bg:'#004b93', text:'#ffffff', font:"'Orbitron',sans-serif", style:'normal' },
    ]},
  ]
  return (
    <div>
      <div style={{textAlign:'center',marginBottom:'28px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.3em',marginBottom:'8px'}}>◈ STRATEGIC ALLIES ◈</div>
        <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif"}}>Organizations powering the games from behind the line.</p>
      </div>
      {tiers.map((tier,ti)=>(
        <div key={ti} style={{marginBottom:'28px',animation:`revealUp 0.4s ${ti*0.1}s both`}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
            <div style={{flex:1,height:'1px',background:`linear-gradient(90deg,transparent,${tier.color}44)`}}/>
            <span style={{color:tier.color,fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.24em',textShadow:`0 0 12px ${tier.glow}`}}>{tier.name}</span>
            <div style={{flex:1,height:'1px',background:`linear-gradient(90deg,${tier.color}44,transparent)`}}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
            {tier.sponsors.map((sp,si)=>(
              <div key={si} style={{
                padding:'40px 24px',
                borderRadius:'4px',
                background: sp.bg,
                border:`2px solid ${tier.color}33`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontFamily: sp.font,
                fontStyle: sp.style,
                fontWeight:700,
                fontSize:'1.6rem',
                color: sp.text,
                letterSpacing:'0.02em',
                boxShadow:`0 0 24px ${tier.glow}`,
                position:'relative',
                overflow:'hidden',
              }}>
                <div style={{position:'absolute',top:'6px',left:'8px',fontSize:'0.45rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.15em',color:`${sp.text}88`}}>{tier.name}</div>
                <div style={{position:'absolute',top:'6px',right:'8px',fontSize:'0.45rem',fontFamily:"'Orbitron',sans-serif",color:`${sp.text}88`}}>◉ ACTIVE</div>
                <div style={{position:'absolute',bottom:'6px',left:'8px',fontSize:'0.45rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em',color:`${sp.text}66`}}>{sp.name.toUpperCase()}</div>
                {sp.name}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Gallery Content ─────────────────────────────────────────────────────────
function GalleryContent() {
  const [sector, setSector] = useState(0)
  const [expanded, setExpanded] = useState(null)

  const sectors = [
    {
      tag:'SECTOR—01', title:'Crimson Stage 2025',
      desc:'Electrifying performances and relentless energy from the main combat stage.',
      images:['/img_s1_1.png','/img_s1_2.png','/img_s1_3.png','/img_s1_4.png'],
    },
    {
      tag:'SECTOR—02', title:'Non-Combat Operations',
      desc:'Tactical creativity, strategic gaming, and high-stakes challenges beyond the digital battlefield.',
      images:['/img_s2_1.png','/img_s2_2.png','/img_s2_3.png','/img_s2_4.png'],
    },
    {
      tag:'SECTOR—03', title:'Final Domain',
      desc:'The crowd ignited as the bass dropped in the final arena showdown.',
      images:['/img_s3_1.png','/img_s3_2.png','/img_s3_3.png','/img_s3_4.png'],
    },
  ]
  const s = sectors[sector]

  return (
    <div>
      <div style={{display:'flex',gap:'8px',marginBottom:'20px'}}>
        {sectors.map((sec,i)=>(
          <button key={i} onClick={()=>{setSector(i);setExpanded(null)}} style={{
            background: sector===i?'rgba(255,0,128,0.15)':'transparent',
            border: sector===i?'1.5px solid rgba(255,0,128,0.6)':'1.5px solid rgba(0,245,255,0.2)',
            borderRadius:'4px', padding:'7px 18px',
            color: sector===i?'#ff0080':'rgba(255,255,255,0.45)',
            fontSize:'0.6rem', fontFamily:"'Orbitron',sans-serif", letterSpacing:'0.16em',
            cursor:'pointer', transition:'all 0.25s ease',
            boxShadow: sector===i?'0 0 16px rgba(255,0,128,0.25)':'none',
          }}>◈ {sec.tag}</button>
        ))}
      </div>

      <div style={{marginBottom:'16px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.52rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.2em',marginBottom:'4px'}}>{s.tag}</div>
        <div style={{color:'#ffffff',fontSize:'1.3rem',fontFamily:"'Rajdhani',sans-serif",fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:'4px'}}>{s.title}</div>
        <div style={{color:'rgba(255,255,255,0.5)',fontSize:'0.8rem',fontFamily:"'Rajdhani',sans-serif"}}>{s.desc}</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gridTemplateRows:'200px 200px',gap:'8px'}}>
        <div
          style={{gridRow:'1 / span 2',position:'relative',overflow:'hidden',borderRadius:'4px',border:'1px solid rgba(0,245,255,0.2)',cursor:'pointer'}}
          onClick={()=>setExpanded(expanded===0?null:0)}
        >
          <img src={s.images[0]} alt="" style={{width:'100%',height:'100%',objectFit:'cover',transition:'transform 0.3s ease',transform:expanded===0?'scale(1.05)':'scale(1)'}}/>
          {expanded===0 && <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'flex-end',padding:'12px'}}>
            <span style={{color:'rgba(0,245,255,0.8)',fontSize:'0.52rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em'}}>◉ FILE 01</span>
          </div>}
        </div>
        {[1,2,3].map(idx=>(
          <div key={idx}
            style={{position:'relative',overflow:'hidden',borderRadius:'4px',border:`1px solid ${expanded===idx?'rgba(0,245,255,0.5)':'rgba(0,245,255,0.2)'}`,cursor:'pointer',transition:'border-color 0.2s'}}
            onClick={()=>setExpanded(expanded===idx?null:idx)}
          >
            <img src={s.images[idx]} alt="" style={{width:'100%',height:'100%',objectFit:'cover',transition:'transform 0.3s ease',transform:expanded===idx?'scale(1.05)':'scale(1)'}}/>
            {expanded===idx && <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'flex-end',padding:'8px'}}>
              <span style={{color:'rgba(0,245,255,0.8)',fontSize:'0.52rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.1em'}}>◉ FILE 0{idx+1}</span>
            </div>}
          </div>
        ))}
      </div>

      <div style={{marginTop:'10px',display:'flex',justifyContent:'flex-end'}}>
        <span style={{color:'rgba(255,0,128,0.7)',fontSize:'0.55rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.15em',cursor:'default'}}>ACCESS {s.images.length} FILES ›</span>
      </div>
    </div>
  )
}

// ─── Contact Content ─────────────────────────────────────────────────────────
function ContactContent() {
  const people = [
    { name:'HARSHITA', phone:'7209593920', img:'/harshita.png' },
    { name:'BIBHUTI BISHAL', phone:'6201371315', img:'/bibhuti.png' },
  ]
  return (
    <div>
      <div style={{textAlign:'center',marginBottom:'28px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.3em',marginBottom:'8px'}}>◈ COMMUNICATIONS ◈</div>
        <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif"}}>Reach the command units directly.</p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'24px',maxWidth:'600px',margin:'0 auto 32px'}}>
        {people.map((p,i)=>(
          <div key={i} style={{
            border:'1.5px solid rgba(0,245,255,0.25)',
            borderRadius:'6px', overflow:'hidden',
            background:'linear-gradient(160deg,rgba(0,10,20,0.95),rgba(0,5,15,0.8))',
            animation:`revealUp 0.4s ${i*0.1}s both`,
            transition:'all 0.3s ease',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.6)';e.currentTarget.style.boxShadow='0 0 24px rgba(0,245,255,0.15)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.25)';e.currentTarget.style.boxShadow='none'}}
          >
            <div style={{
              width:'100%', aspectRatio:'1/1', overflow:'hidden',
              borderBottom:'1px solid rgba(0,245,255,0.15)',
              position:'relative',
            }}>
              <img src={p.img} alt={p.name} style={{
                width:'100%',height:'100%',objectFit:'cover',objectPosition:'center top',
                display:'block',
              }}/>
              <div style={{
                position:'absolute',inset:0,
                background:'linear-gradient(to bottom,transparent 60%,rgba(0,0,0,0.5))',
              }}/>
            </div>
            <div style={{padding:'14px 14px 16px',textAlign:'center'}}>
              <div style={{
                color:'#ffffff',fontSize:'0.9rem',
                fontFamily:"'Orbitron',sans-serif",fontWeight:700,
                letterSpacing:'0.08em',marginBottom:'8px',
              }}>{p.name}</div>
              <a href={`tel:+91${p.phone}`} style={{
                display:'inline-flex',alignItems:'center',gap:'6px',
                color:'rgba(0,245,255,0.9)',
                fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif",fontWeight:600,
                letterSpacing:'0.05em',textDecoration:'none',
                border:'1px solid rgba(0,245,255,0.3)',
                borderRadius:'3px',padding:'5px 12px',
                transition:'all 0.2s ease',
              }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,245,255,0.1)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}
              >
                <span style={{fontSize:'0.7rem'}}>📞</span> {p.phone}
              </a>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'12px',
        borderTop:'1px solid rgba(0,245,255,0.1)',paddingTop:'20px',
        maxWidth:'600px',margin:'0 auto',
      }}>
        {[
          {icon:'✉', label:'rivierafest2026@hit.ac.in'},
          {icon:'📍', label:'HIT Haldia, Purba Medinipur, WB'},
        ].map((c,i)=>(
          <div key={i} style={{
            display:'flex',gap:'10px',alignItems:'center',
            padding:'12px 16px',
            border:'1px solid rgba(0,245,255,0.12)',
            borderRadius:'4px',
            background:'rgba(0,245,255,0.03)',
          }}>
            <div style={{fontSize:'1.1rem'}}>{c.icon}</div>
            <span style={{color:'rgba(255,255,255,0.6)',fontSize:'0.75rem',fontFamily:"'Rajdhani',sans-serif"}}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
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
    let dragging = false
    let lastX = 0, lastY = 0
    const onMouseDown = e => {
      dragging = true; lastX = e.clientX; lastY = e.clientY
      sharedRefs.dragging.current = true
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
    const onMouseUp = () => { dragging = false; sharedRefs.dragging.current = false }
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
    const dragState = { active:false, x:0, y:0 }
    const state = dragState
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
      const norm = e.deltaMode===1?40:e.deltaMode===2?800:1
      const dy = e.deltaY*norm, dx = e.deltaX*norm
      sharedRefs.vel.current += dy*0.000016
      sharedRefs.targetT.current = -1
      sharedRefs.yaw.current    -= dx * 0.0022
      sharedRefs.autoYaw.current = true
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
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-thumb { background: rgba(0,245,255,0.25); border-radius: 4px }
        ::-webkit-scrollbar-track { background: transparent }
      `}</style>

      <Switch2DBar />
      <div style={{ width:'100vw', height:'100vh', overflow:'hidden', background:'#030a0f', paddingTop:'38px' }}>
        <CanvasErrorBoundary>
          <Canvas
            camera={{ fov:65, near:1, far:9000000 }}
            gl={{ antialias:true }}
            style={{ width:'100%', height:'100%', position:'absolute', inset:0 }}
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
        {ready && (
          <>
            <SectionPanel
              section={activeSection}
              visible={!!activeSection}
              scrollsLeft={scrollsLeft}
            />
            <ScrollIndicator visible={!activeSection} />
          </>
        )}
      </div>
    </>
  )
}
