// ─── _app.js Example ─────────────────────────────────────────────────────────
// Copy Switch3DBar.jsx into your Next.js: components/Switch3DBar.jsx
// Then in your existing pages/_app.js, add Switch3DBar like shown below.
//
// If you use App Router (Next.js 13+), see the layout.js example at the bottom.
// ─────────────────────────────────────────────────────────────────────────────

import Switch3DBar from '../components/Switch3DBar';
import '../styles/globals.css'; // keep your existing import

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      {/* This renders the glowing "SWITCH TO 3D" bar on EVERY page */}
      <Switch3DBar />

      {/* Your existing app content renders normally below it */}
      <Component {...pageProps} />
    </>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// IF YOU USE APP ROUTER (app/layout.js) — use this instead:
// ─────────────────────────────────────────────────────────────────────────────
//
// import Switch3DBar from '../components/Switch3DBar';
//
// export default function RootLayout({ children }) {
//   return (
//     <html lang="en">
//       <body>
//         <Switch3DBar />
//         {children}
//       </body>
//     </html>
//   );
// }
