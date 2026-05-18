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
  -Math.PI/2, -Math.PI/2, 0, -Math.PI/2, -Math.PI/2,
  -Math.PI/2, Math.PI, Math.PI, Math.PI/2, Math.PI/2,
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
  11: 'contact',
}

// How many scrolls to fill before advancing
const SCROLL_THRESHOLD = 3

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

        <div style={{flex:1, minHeight:0, overflowY:'auto', padding:'24px 36px 24px', position:'relative'}}>
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
    { sector:'SECTOR-01', tag:'RECON', icon:'◉', name:'Hidden Protocol', desc:'Navigate a web of encoded clues across the arena. Decode, pursue, and outmaneuver rival squads in a high-stakes survival pursuit.', status:'ACTIVE' },
    { sector:'SECTOR-02', tag:'PERFORMANCE', icon:'♪', name:'Crimson Stage', desc:'Where performance becomes a weapon. Electrifying acts under crimson lights in the most intense cultural showdown.', status:'ACTIVE' },
    { sector:'COMBAT-03', tag:'DIGITAL', icon:'⚙', name:'Digital Combat', desc:'Enter the digital battlefield. Only reflexes, strategy, and ruthless precision will determine the survivors.', status:'ACTIVE' },
    { sector:'TACTICAL-04', tag:'INNOVATION', icon:'◈', name:'Innovation Forge', desc:'A vault of cutting-edge creations and experimental technology. Where visionary minds showcase weapons of innovation.', status:'ACTIVE' },
    { sector:'SECTOR-05', tag:'MUSIC', icon:'▶', name:'Sonic Assault', desc:'Bass drops and beats collide in a relentless sonic battle. The crowd becomes the arena.', status:'UPCOMING' },
    { sector:'SECTOR-06', tag:'DESIGN', icon:'✦', name:'Pixel Protocol', desc:'Visual artistry meets tactical precision. Create, compete, and conquer the design domain.', status:'UPCOMING' },
    { sector:'SECTOR-07', tag:'ROBOTICS', icon:'⚡', name:'Mech Uprising', desc:'Build, program, and deploy. The last machine standing wins glory in the arena.', status:'UPCOMING' },
    { sector:'SECTOR-08', tag:'QUIZ', icon:'?', name:'Data Extraction', desc:'Knowledge is power. Extract answers faster than rival teams in the high-stakes intelligence war.', status:'UPCOMING' },
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
    { name:'TIER ALPHA', color:'#00f5ff', glow:'rgba(0,245,255,0.4)', sponsors:['Sprite','Coca-Cola'] },
    { name:'TIER BETA', color:'#ff0080', glow:'rgba(255,0,128,0.4)', sponsors:['Fanta','Pepsi'] },
    { name:'TIER GAMMA', color:'rgba(255,215,0,0.9)', glow:'rgba(255,215,0,0.35)', sponsors:['TechCorp','InnoLabs','FutureSys','DataStream'] },
    { name:'TIER DELTA', color:'rgba(255,255,255,0.5)', glow:'rgba(255,255,255,0.2)', sponsors:['PixelWorks','NeonArts','CodeCraft','ByteForge','SignalRush','GridMind'] },
  ]
  const sponsorColors = {
    'Sprite':  { bg:'#00a651', text:'#ffffff' },
    'Coca-Cola':{ bg:'#e61c24', text:'#ffffff' },
    'Fanta':   { bg:'#ff6b00', text:'#ffffff' },
    'Pepsi':   { bg:'#004b93', text:'#ffffff' },
  }
  return (
    <div>
      <div style={{textAlign:'center',marginBottom:'22px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.3em',marginBottom:'8px'}}>◈ STRATEGIC ALLIES ◈</div>
        <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif"}}>Organizations powering the games from behind the line.</p>
      </div>
      {tiers.map((tier,ti)=>(
        <div key={ti} style={{marginBottom:'22px',animation:`revealUp 0.4s ${ti*0.1}s both`}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'12px'}}>
            <div style={{flex:1,height:'1px',background:`linear-gradient(90deg,transparent,${tier.color}44)`}}/>
            <span style={{color:tier.color,fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.24em',textShadow:`0 0 12px ${tier.glow}`}}>{tier.name}</span>
            <div style={{flex:1,height:'1px',background:`linear-gradient(90deg,${tier.color}44,transparent)`}}/>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:'10px'}}>
            {tier.sponsors.map((sp,si)=>{
              const sc = sponsorColors[sp]
              return (
                <div key={si} style={{
                  flex: ti<2?'1':'none', minWidth: ti<2?'200px':'120px',
                  padding: ti<2?'28px 20px':'14px 16px',
                  borderRadius:'4px',
                  background: sc ? sc.bg : 'rgba(0,245,255,0.05)',
                  border: sc ? 'none' : `1px solid ${tier.color}33`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontFamily: sc?'Georgia,serif':'Orbitron,sans-serif',
                  fontStyle: sc?'italic':'normal',
                  fontWeight: 700,
                  fontSize: ti<2?'1.2rem':'0.7rem',
                  color: sc ? sc.text : tier.color,
                  letterSpacing: sc?'0.02em':'0.1em',
                  cursor:'default',
                }}>
                  {sp}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Gallery Content ─────────────────────────────────────────────────────────
function GalleryContent() {
  const [active, setActive] = useState(1)
  const items = [
    { title:'Cyber Arena 2024', year:'2024', desc:'A convergence of technology and performance under the city\'s neon canopy.' },
    { title:'Digital Uprising', year:'2024', desc:'Thousands of players, one arena — the most electrifying competition yet.' },
    { title:'Protocol Night', year:'2023', desc:'When the lights went out and the protocols began — an unforgettable night.' },
    { title:'Crimson Finals', year:'2023', desc:'Championship battles that rewrote the record books forever.' },
    { title:'Neon Genesis', year:'2022', desc:'The first edition that started it all — where legends were born.' },
    { title:'Ghost Signal', year:'2022', desc:'Stealth, strategy, and survival in the arena\'s inaugural season.' },
  ]
  return (
    <div>
      <div style={{textAlign:'center',marginBottom:'22px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.3em',marginBottom:'8px'}}>◈ ARCHIVE FEED ◈</div>
        <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif"}}>Chronicles from previous operations. Study the fallen. Learn from the survivors.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'14px'}}>
        {items.map((item,i)=>(
          <div key={i} onClick={()=>setActive(i)} style={{
            padding:'0', borderRadius:'4px', overflow:'hidden',
            border:`1.5px solid ${active===i?'rgba(0,245,255,0.5)':'rgba(0,245,255,0.12)'}`,
            background:'linear-gradient(160deg,rgba(0,10,20,0.9),rgba(0,5,15,0.7))',
            cursor:'pointer',
            animation:`revealUp 0.4s ${i*0.07}s both`,
            transition:'all 0.3s ease',
            boxShadow: active===i?'0 0 20px rgba(0,245,255,0.2)':'none',
          }}>
            <div style={{
              height:'120px',
              background:`linear-gradient(160deg, hsl(${i*40+180},70%,10%), hsl(${i*40+200},60%,6%))`,
              display:'flex',alignItems:'center',justifyContent:'center',
              borderBottom:'1px solid rgba(0,245,255,0.1)',
              position:'relative', overflow:'hidden',
            }}>
              <div style={{
                position:'absolute',inset:0,
                backgroundImage:'linear-gradient(rgba(0,245,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,0.03) 1px,transparent 1px)',
                backgroundSize:'20px 20px',
              }}/>
              <div style={{
                fontFamily:"'Orbitron',sans-serif",fontWeight:900,
                fontSize:'2.5rem',color:'rgba(0,245,255,0.06)',
                letterSpacing:'0.2em',position:'absolute',
              }}>IMG</div>
              <div style={{
                border:'1px solid rgba(0,245,255,0.25)',
                borderRadius:'50%',width:'40px',height:'40px',
                display:'flex',alignItems:'center',justifyContent:'center',
                color:'rgba(0,245,255,0.5)',fontSize:'1.2rem',zIndex:1,
              }}>◈</div>
            </div>
            <div style={{padding:'12px 14px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'5px'}}>
                <div style={{color:'#ffffff',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif",fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>{item.title}</div>
                <span style={{color:'rgba(0,245,255,0.5)',fontSize:'0.55rem',fontFamily:"'Orbitron',sans-serif",border:'1px solid rgba(0,245,255,0.25)',borderRadius:'3px',padding:'1px 6px'}}>{item.year}</span>
              </div>
              <div style={{color:'rgba(255,255,255,0.45)',fontSize:'0.75rem',fontFamily:"'Rajdhani',sans-serif",lineHeight:1.4}}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Contact Content ─────────────────────────────────────────────────────────
function ContactContent() {
  const people = [
    { role:'Website, App\nand Payments', img:'👨‍💻' },
    { role:'Registrations\nand Correspondence', img:'👩‍💼' },
    { role:'Logistics and\nOperations', img:'👨‍💼' },
    { role:'Sponsorships\nand Company\nCollaborations', img:'🧑‍💼' },
    { role:'Reception and\nAccommodation', img:'👩‍🦰' },
    { role:'Online\nCollaborations\nand Publicity', img:'👨‍🦱' },
    { role:'Guest Lectures\nand Paper\nPresentation', img:'👩‍🔬' },
    { role:'General Secretary,\nStudents\' Union', img:'🧑' },
    { role:'President,\nStudents\' Union', img:'🕶️' },
  ]
  return (
    <div>
      <div style={{textAlign:'center',marginBottom:'22px'}}>
        <div style={{color:'rgba(0,245,255,0.5)',fontSize:'0.58rem',fontFamily:"'Orbitron',sans-serif",letterSpacing:'0.3em',marginBottom:'8px'}}>◈ COMMUNICATIONS ◈</div>
        <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',fontFamily:"'Rajdhani',sans-serif"}}>Reach the command units directly. Every sector has a handler.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:'12px',marginBottom:'24px'}}>
        {people.map((p,i)=>(
          <div key={i} style={{
            border:'1.5px solid rgba(0,245,255,0.18)',
            borderRadius:'4px', overflow:'hidden',
            background:'linear-gradient(160deg,rgba(0,10,20,0.9),rgba(0,5,15,0.7))',
            animation:`revealUp 0.4s ${i*0.05}s both`,
            cursor:'default',
            transition:'all 0.3s ease',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.5)';e.currentTarget.style.boxShadow='0 0 16px rgba(0,245,255,0.15)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,245,255,0.18)';e.currentTarget.style.boxShadow='none'}}
          >
            <div style={{
              height:'100px', position:'relative', overflow:'hidden',
              background:'linear-gradient(160deg,rgba(0,20,40,0.9),rgba(0,10,20,0.7))',
              borderBottom:'1px solid rgba(0,245,255,0.1)',
              display:'flex',alignItems:'center',justifyContent:'center',
            }}>
              <div style={{
                position:'absolute',inset:0,
                backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 4px,rgba(0,245,255,0.02) 4px,rgba(0,245,255,0.02) 5px)',
              }}/>
              <div style={{
                width:'56px',height:'56px',borderRadius:'4px',
                background:'rgba(0,245,255,0.08)',
                border:'1px solid rgba(0,245,255,0.25)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:'1.8rem',zIndex:1,
              }}>{p.img}</div>
              <div style={{
                position:'absolute',bottom:'4px',right:'6px',
                width:'8px',height:'8px',borderRadius:'50%',
                background:'rgba(0,0,0,0.8)',
                border:'1px solid rgba(0,245,255,0.3)',
                display:'flex',alignItems:'center',justifyContent:'center',
              }}>
                <div style={{width:'4px',height:'4px',borderRadius:'50%',background:'rgba(0,245,255,0.6)'}}/>
              </div>
            </div>
            <div style={{padding:'10px 10px'}}>
              <div style={{
                color:'rgba(0,245,255,0.9)',fontSize:'0.66rem',
                fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                textAlign:'center',lineHeight:1.35,letterSpacing:'0.02em',
                whiteSpace:'pre-line',
              }}>{p.role}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',
        borderTop:'1px solid rgba(0,245,255,0.1)',paddingTop:'18px',
      }}>
        {[
          {icon:'✉', label:'info@cyberfest2026.com'},
          {icon:'📞', label:'+91 9142047263'},
          {icon:'📍', label:'HIT Campus, West Bengal'},
        ].map((c,i)=>(
          <div key={i} style={{
            display:'flex',gap:'10px',alignItems:'center',
            padding:'10px 14px',
            border:'1px solid rgba(0,245,255,0.12)',
            borderRadius:'4px',
            background:'rgba(0,245,255,0.03)',
          }}>
            <div style={{fontSize:'1.1rem'}}>{c.icon}</div>
            <span style={{color:'rgba(255,255,255,0.6)',fontSize:'0.7rem',fontFamily:"'Rajdhani',sans-serif"}}>{c.label}</span>
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
  const [currentWp,   setCurrentWp]   = useState(0)
  const [atHome,      setAtHome]      = useState(true)
  const [activeSection,setActiveSection] = useState(null)
  const [scrollsLeft, setScrollsLeft] = useState(SCROLL_THRESHOLD)
  const [activeNav,   setActiveNav]   = useState('home')

  const scrollLock = useRef({ lockedWpIdx: -1, count: 0 })
  const time = useCountdown()

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
      sharedRefs.yaw.current   -= dx * 0.0038
      sharedRefs.pitch.current -= dy * 0.0038
      sharedRefs.pitch.current  = Math.max(-1.35, Math.min(1.35, sharedRefs.pitch.current))
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
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-thumb { background: rgba(0,245,255,0.25); border-radius: 4px }
        ::-webkit-scrollbar-track { background: transparent }
      `}</style>

      <div style={{ width:'100vw', height:'100vh', overflow:'hidden', background:'#030a0f' }}>
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
