# Plasma Studio → Effects Studio — Product Roadmap & Engineering Handoff

Handoff spec for development in Claude Code. The current build is one self-contained file,
`plasma_studio.html` (~850 lines). It works, but single-file development has hit its limit.
This doc covers: product vision, the recommended stack, the as-built architecture, hard-won
gotchas, the **Next.js migration guide**, the **generation-engine upgrade path**, and the
prioritized roadmap. Do not implement against the HTML file beyond Milestone 0 — migrate first.

---

## 1. Product vision

A **web-based studio for generative background effects** — think "design tool for live
backgrounds": pick a generator engine, art-direct it with real-time controls, then export it as
a live interactive web background (embed/component), a seamless loop video, or stills.

The current plasma/gradient system is **engine #1**, not the product. The architecture must
treat engines as plugins so the studio grows into a multi-engine effects generator
(mesh gradients, particles, flow fields, raymarched volumes…) without rewrites. Revenue-shaped
ideas for later: preset gallery/community, team libraries, white-label embeds — none block v1.

---

## 2. Recommended stack (opinionated)

| Layer | Choice | Why |
|---|---|---|
| App shell | **v1: Vite + React SPA. Adopt Next.js 15 only when server features land.** TypeScript strict either way. | The studio is 100% client-side — SSR adds nothing to a WebGL canvas, and Next's server/client boundary (`'use client'`, hydration, dynamic ssr:false) is pure friction here. Vite iterates faster and deploys as static files anywhere. Next earns its keep only at the gallery/auth/SEO/OG-image phase; the app shell is deliberately thin, so swapping later is cheap. |
| Engine core | **Raw WebGL2 in framework-agnostic TS** (WebGL1 fallback) | The engine is already raw WebGL and small; three.js adds ~600 KB for nothing we use. WebGL2 gives float/linear FBOs (better flowmap), `#version 300 es`. Keep the core importable with **zero React/Next dependencies** — it must also power the embed. (Acceptable alt: OGL ~30 KB if FBO ergonomics are wanted; do not adopt three.) |
| State | **Zustand + zod** | One config store; renderer subscribes **outside React** (no re-render per frame). zod validates configs from share links/imports (untrusted input). |
| UI | **Tailwind v4 + shadcn/ui + lucide-react** | The panel already imitates shadcn tokens — porting is mechanical. Accessible primitives (sliders, popovers, tabs) for free. |
| Animation/timeline | **GSAP (+ ScrollTrigger)** | Timeline/keyframe scrubbing in-studio and the scroll-driven story for embeds. The embed runtime exposes a plain API; GSAP drives it. |
| Color | **culori** | OKLCH palette interpolation for preset morphing (RGB lerps go muddy). |
| Share links | **lz-string** (base64url-compressed config in URL hash) | Zero-backend sharing for v1; DB-backed short links later. |
| Monorepo | **pnpm workspaces + Turborepo** | `packages/core`, `packages/embed`, `packages/react`, `apps/studio`. Embed must stay dependency-free and tiny. |
| Embed build | **tsup/Vite lib mode → vanilla `<plasma-bg>` custom element** | No Lit, no React in the embed. Target < 15 KB gzip. |
| Video export | **MediaRecorder now → WebCodecs + mp4-muxer (P3)** | WebCodecs gives real MP4/H.264, controlled bitrate, no realtime constraint (render faster than realtime). |
| Testing | **Vitest (unit) + Playwright (visual goldens)** | Screenshot-diff every shader change — the workflow upgrade this project most needs (see gotcha #13). |
| Backend (later) | **Vercel + Neon Postgres + Drizzle; Auth.js** | Only when the preset gallery/accounts land. v1 ships backend-free. |

### Framework decision, honestly
Next.js is not the best fit for *this app today*; it's the best fit for one possible *future*
of it. Decision rule: **everything that matters runs in the browser → Vite SPA wins** (faster
dev loop, no hydration/SSR pitfalls around WebGL, static hosting). The moment any of these
become real — community preset gallery with SEO pages, accounts, server-generated OG images
for share links — **move the shell to Next**. Because `packages/core` and `packages/embed` are
framework-free and the studio shell is thin React, that move is days, not a rewrite. Don't pay
Next's complexity tax on day one for features that may never ship. (SvelteKit/Solid would also
work and are leaner still, but React keeps shadcn/ui, the largest talent pool, and the
`packages/react` wrapper you need anyway.)

---

## 3. Current state (as-built, in `plasma_studio.html`)

### Rendering
Fullscreen-triangle fragment shader (vertices `[-1,-1, 3,-1, -1,3]`, one
`drawArrays(TRIANGLES,0,3)`), WebGL1. Fragment source assembled at runtime:

```
buildFrag() = PRE_A + FIELDS[fieldIdx].src + PRE_B + MATERIALS[matIdx].src + MAIN
```

- **PRE_A** — precision, all uniforms, helpers in dependency order: `rot`, `shapeXf`, `hash`,
  `noise`, `fbm`, then `asp()` (uses noise → must come after).
- **FIELDS** (motion, `float plasma(vec2,float)`): Classic, Deep Fold, Kaleidoscope, Liquid,
  Electric, Marble, Vortex, Breathe, Shimmer + clean ramps Linear/Radial/Conic (no fbm).
- **PRE_B** — `calcNormal`, `blurP`, `screenb`, `ovl`.
- **MATERIALS** (`vec3 effect()`): Smooth, Liquid Glass, Chromatic, Liquid Metal, Holographic,
  Frosted, Oil Slick, Crystal, Pearl, Neon Gel, Prism, Warped, Mesh, Aurora.
- **MAIN** — coverage threshold reveal → screen blend over bg → visibility mix → contrast
  (overlay ≥1.0, linear <1.0) → cursor color modes (contrast → light → spotlight, order
  intentional) → film grain.

### Coordinate pipeline (`asp()`)
NDC → aspect → cursor distortion (flowmap fluid/pixels) → center → scale → rotate → flow drift →
flow streaming ripple → `shapeXf` → gravity sine-bend. Shapes (Free, Linear, Circle, Angular,
Spiral, Polar, Mirror) encode angles as cos/sin pairs — never raw atan ramps (seams).

### Cursor system — true flowmap
256×256 RGBA8 ping-pong FBO; per-frame stamp/decay pass (`FLOW_FRAG`): velocity in RG
(`(rg-0.5)*2`), strength in B; dissipation `0.85+0.13*trail`; falloff `max(0.03, size*0.5)`.
Main shader samples `u_fmap` for displacement (fluid), pixelation mask, and strength-driven
spotlight/light/contrast. Modes are multi-select via `uniform float u_cm[5]` (WebGL1: no
bitwise; float flag array via `uniform1fv`). Params: strength, size, trail, turbulence
(layered sines — NOT fbm), lag. Runs 240 frames past last activity, then idles. Disabled
during exports.

### State / UI / exports
~25 loose `let` variables. Stacked sliders with editable value boxes (`NUMCFG` map) and center
ticks; tab chips (motion/material/shape); multi-select cursor chips; 8 randomized theme "vibes"
(`THEMES` → `applyConfig`); surprise-me (Space); gradient presets; harmony palette generator;
bg hex input; draggable center handle; hide-UI (H). Exports: (a) `buildEmbed()` — string-built
self-contained snippet with the assembled shader, baked params, its own flowmap FBO, pointer
listeners; (b) seamless loop video — two-playhead crossfade, MediaRecorder webm; (c) PNG up
to 4K. Perf: adaptive render scale 0.6–1.0 by EMA frame time, hidden-tab pause,
dirty-flag rendering while paused, DPR ≤ 2, `tAccum` rescaled on speed change.

---

## 4. Gotchas — read before touching anything

1. **GLSL declaration order**: no hoisting; `asp()` needs `noise/fbm` defined above it. Broke once.
2. **fbm as displacement looks "frosty"/pixelated** — its high-frequency octaves alias. Use
   layered sines for coordinate churn; fbm is fine for color fields.
3. **Discrete gaussian splats read as "multiple circles"** — that's why the flowmap texture
   exists. Don't regress to point trails.
4. **atan seams**: encode angle as cos/sin pairs or triangle waves.
5. **WebGL1**: no bitwise ops (float flag arrays), constant loop bounds, `u_flow` name is taken
   (flow-direction feature) — flowmap sampler is `u_fmap`.
6. **Array uniforms**: fetch location of `u_cm[0]`, not `u_cm`.
7. **TDZ**: render-loop state must be declared before `resize()`/first frame.
8. **Speed changes must rescale `tAccum`** (`*= old/new`) or the image jumps/recolors.
9. **Scale is inverted** (`scale = 100/valuePct`) so bigger % = bigger pattern. Keep semantics.
10. **The string-built embed duplicates the runtime** and drifted out of sync repeatedly —
    every uniform had to be wired in 5 places. The migration kills this class of bug.
11. **Cursor color-mode order** in MAIN is intentional (contrast → light → spotlight).
12. **Flowmap textures must be LINEAR-filtered** or distortion bands.
13. **Verification**: original environment couldn't run WebGL; shader math was verified by
    replicating GLSL in numpy. Replace this with Playwright screenshot goldens immediately.
14. User priorities observed: smoothness above all (no grids/banding), distinct
    non-overlapping parameters, intuitive slider directions, seamless loops, honest notes when
    approximating a reference technique.

---

## 5. App migration guide (Milestone 0–1) — same shape on Vite or Next

### Target structure (pnpm + Turborepo)

```
effects-studio/
  packages/
    core/                 # zero-dependency engine (TS, raw WebGL2/1)
      src/engine.ts       # Engine interface + registry (see §6)
      src/plasma/
        shaders.ts        # VERT, FLOW_FRAG, PRE_A, PRE_B, MAIN, FIELDS, MATERIALS (verbatim GLSL)
        renderer.ts       # PlasmaRenderer: GL setup, flowmap FBO, recompile, uniforms, frame loop
        config.ts         # zod schema + defaults + types (the P0 config object)
        themes.ts         # THEMES, GRADIENTS, palette generators
      src/exporters/
        png.ts  video.ts  embed.ts
    embed/                # <plasma-bg> custom element wrapping core (<15KB gz, no React)
    react/                # <PlasmaCanvas/> thin wrapper (useRef + useEffect mount)
  apps/
    studio/               # Vite + React SPA (or Next 15 — see §2 decision)
      src/App.tsx                  # (Next equivalent: app/(studio)/page.tsx)
      src/share.tsx                # /#s=… restore (Next: app/s/[hash]/page.tsx)
      components/panel/*           # shadcn-based controls
      stores/config.ts             # zustand store of CoreConfig
  tests/visual/           # Playwright goldens
  plasma_studio.html      # legacy reference — keep until parity, then delete
```

### Port order (each step leaves a working app)
1. **Extract GLSL verbatim** from the HTML into `core/src/plasma/shaders.ts` (script the
   extraction; do not retype shader strings — transcription bugs are invisible until render).
2. **Write `config.ts`**: the single config object + zod schema. This IS the P0 refactor:

   ```ts
   export const PlasmaConfig = z.object({
     version: z.literal(1),
     motion: z.enum([...FIELD_NAMES]), material: z.enum([...MATERIAL_NAMES]),
     shape: z.enum([...SHAPE_NAMES]),
     palette: z.array(hex).min(1).max(8), bg: hex,
     speed: z.number(), scalePct: z.number(), swirl: z.number(), turbulence: z.number(),
     flow: z.object({ angleDeg: z.number(), amount: z.number() }),
     coverage: z.number(), contrast: z.number(), visibility: z.number(),
     gravity: z.number(), grain: z.number(), rotateDeg: z.number(),
     center: z.tuple([z.number(), z.number()]),
     cursor: z.object({ on: z.boolean(), modes: z.array(z.enum(['fluid','pixels','spotlight','light','contrast'])),
       strength: z.number(), size: z.number(), trail: z.number(), turbulence: z.number(), lag: z.number() }),
   });
   ```
3. **Port `renderer.ts`** as a class: `new PlasmaRenderer(canvas)`, `setConfig(cfg)` (diffs →
   recompile only when motion/material/shape change, else uniforms), `start/stop/seek`,
   `dispose()` (delete programs/textures/FBOs — React StrictMode mounts twice; dispose must be
   idempotent). Pointer handling stays inside the renderer (it owns lag/velocity/flowmap).
4. **React wrapper**: renderer in `useRef`, created in `useEffect`, never in
   render (on Next additionally `'use client'` + `dynamic(..., { ssr:false })`). Zustand store holds the
   config; the renderer subscribes via `store.subscribe` (transient updates — no React
   re-render per slider drag; sliders write straight to the store).
5. **Rebuild the panel** with shadcn primitives, porting the existing CSS tokens/classnames
   into Tailwind. Keep the established look — it was iterated deliberately (stacked sliders,
   editable value boxes, center ticks, chips).
6. **Exporters**: PNG/video port nearly unchanged (browser-only modules). **Embed**: replace
   the string-built snippet with `packages/embed` consuming the same core — "copy code" emits
   `<script src=".../plasma-bg.js"></script><plasma-bg config="…">` plus an offline
   "inline everything" option for the no-dependency guarantee.
7. **Share links**: serialize config → lz-string → `/#s=…` (hash route — works on static hosting);
   add a real `/s/[hash]` route if/when on Next. Validate with zod on load.
8. **Playwright goldens** before any shader edits: grid of (motion × material × shape) samples
   plus scripted cursor moves on the flowmap.

### If/when the shell moves to Next
Everything WebGL stays client-only (`'use client'`, `ssr:false`) — hydration adds nothing to a
canvas. The features that actually justify Next: server OG images for share links
(satori/@vercel/og), SEO-rendered gallery pages, API routes for accounts. Until one of those
is scheduled, stay on Vite.

---

## 6. Generation-engine upgrade path

### Engine abstraction (the studio's plugin API)
```ts
interface EffectEngine<C> {
  id: string; name: string;
  schema: ZodType<C>; defaults: C;
  controls: ControlSpec[];            // drives auto-generated panel sections
  create(canvas: HTMLCanvasElement, cfg: C): EngineInstance<C>;
}
interface EngineInstance<C> {
  setConfig(cfg: C): void; start(): void; stop(): void; seek(t: number): void;
  renderStill(w: number, h: number): Promise<Blob>;
  dispose(): void;
}
```
The plasma engine is the first implementation; the panel, presets, share links, exporters, and
embed all operate on `EffectEngine` so new engines plug in without touching the studio.

### Engine upgrades (ordered)
1. **WebGL2 baseline** (`#version 300 es`), WebGL1 fallback: float/linear FBOs → higher-quality
   flowmap (no 8-bit velocity quantization), MRT available for post.
2. **Multi-pass post pipeline** on the existing FBO infra: bloom (bright-pass → separable blur,
   half-res), glass/refraction cursor mode (sample scene offset by flowmap gradient + fresnel),
   chromatic aberration, vignette — each a toggleable pass with its own config block.
3. **Animation runtime**: `lerpConfig(a,b,t)` (numerics lerp, palettes in OKLCH via culori,
   discrete fields switch at t=0.5), embed API
   `plasmaBG.set/animateTo/timeline/play/pause/seek` for GSAP/ScrollTrigger; in-studio
   keyframe track (2–6 keyframes + easing); optional audio reactivity (WebAudio analyser →
   any numeric config path).
4. **New engines** (each validates the plugin API): mesh gradient (animated control-point
   mesh), particle field (instanced points + curl noise), flow-field lines, raymarched volume
   (clouds/nebula). One new engine ≈ shaders + schema + controls; zero studio changes.
5. **WebGPU** only after WebGL2 post pipeline ships — compute-shader fluid sim would replace
   the flowmap with true advection; design the engine interface so the backend is swappable.

### Hardening (ship with M2)
WebGL-fail fallback (static CSS gradient from palette — never black), `prefers-reduced-motion`
(pause + still frame), IntersectionObserver (stop rAF off-screen), touch velocity tuning,
context-loss recovery (`webglcontextlost/restored` → rebuild from config — config-as-truth
makes this trivial).

---

## 7. Milestones

| M | Deliverable | Done when |
|---|---|---|
| 0 | Monorepo scaffold + GLSL extraction + Playwright harness | Goldens render from `core` matching legacy HTML |
| 1 | Studio app at parity (config-store architecture) | Every legacy feature works; config round-trips; legacy file deletable |
| 2 | Presets + share links + hardening | URL restores exact look; never-black; reduced-motion |
| 3 | Embed package + runtime API + preset morphing | `<plasma-bg>` <15KB gz; GSAP scroll demo scrubs `animateTo` |
| 4 | Post pipeline (bloom, glass) + WebCodecs MP4 export | Toggleable passes; mp4 downloads |
| 5 | Keyframe timeline + second engine (mesh gradient) | Timeline exports with embed; engine #2 ships with zero studio edits |

---

## 8. Notes for the implementing agent
- Read §4 before touching shaders; screenshot-diff every shader change.
- Never retype GLSL — extract programmatically from the legacy file.
- The renderer core must stay React-free; React only mounts/unmounts it.
- Embed bundle budget is a feature: < 15 KB gzip, zero dependencies.
- When in doubt about feel/UX, the legacy HTML is the spec — its look and slider semantics were
  deliberately iterated with the user.

---

## 9. Feature idea bank (backlog — promote into milestones after M3)

Ranked within category: ★ = bet-on-it (high impact, builds on existing architecture).

### Creative input
- ★ **Image → preset**: extract palette (k-means in OKLCH) + mood heuristics
  (brightness/contrast/saturation → speed/turbulence/coverage) from a dropped image. Brand-kit
  variant: lock palette to brand hexes, generate on-brand variations only.
- ★ **Text-to-preset (AI)**: natural language → config via LLM structured output against the
  zod schema ("calm dawn over slow ocean"). The schema already exists; validate + clamp on
  receipt. Differentiator, low engine cost.
- **Evolve/breeding mode**: 3×3 grid of config mutations; click → becomes parent; iterate.
  Mutation = jittered numerics + occasional discrete swaps, seeded.
- **Seeded determinism**: every randomize gets a visible, shareable seed; same seed → identical
  result. Prereq for evolve, batch export, and trust in sharing.
- **Lock-and-randomize**: per-param lock toggles; randomize only unlocked params.
- **A/B morph preview**: load two presets, scrub `lerpConfig` between them (doubles as
  transition authoring for the timeline).

### Engine capabilities
- ★ **Layer compositing**: 2–3 engine instances rendered to textures, blended
  (screen/overlay/multiply) with per-layer speed/opacity/parallax. Reuses flowmap FBO infra.
  Single biggest versatility multiplier.
- ★ **Text & SVG masking**: rasterize typed text / uploaded SVG path to an alpha texture; the
  effect renders inside (or outside) the mask. Hero-section killer feature.
- **Stylization post passes**: ordered + blue-noise dithering, palette quantization (retro),
  halftone, ASCII glyph rendering, topographic contour lines. Each a toggleable pass with its
  own config block (fits §6.2 pipeline).
- **Reaction-diffusion (Gray-Scott) as engine #2**: reuses the ping-pong FBO pattern almost
  verbatim; consider it instead of mesh gradient as the plugin-API proof (more distinctive).
- **Pseudo-depth parallax**: field height → depth; offset on scroll + mobile gyroscope
  (DeviceOrientation, permission-gated on iOS).

### Reactivity
- **Click shockwaves**: stamp radial impulse into the existing flowmap on pointerdown — cheap.
- **Scroll-velocity reactivity** (embed): page scroll speed feeds turbulence/strength.
- **Time-of-day mode**: morph between dawn/day/dusk/night configs on local time;
  `prefers-color-scheme` auto-variant.
- **Data-bound params**: map a config path to a polled JSON value (weather/metrics-reactive
  ambient backgrounds). Ship as embed-API recipe, not core feature.
- **Audio reactivity** (already §6.3): band-mapping UI — pick param, pick band, set range.

### Output & distribution
- **Batch export**: N seeds × size presets (OG 1200×630, 1080², 9:16, 4K) → zip. Needs seeds.
- **OBS browser-source mode**: transparent clear color + alpha-preserving canvas for streamer
  overlays. Near-zero engine work, real distribution channel.
- **Figma plugin**: render stills into selected frames (uses `renderStill` from the engine API).
- **CSS-only fallback export**: nearest animated-CSS-gradient approximation for no-JS/email.
- **Per-breakpoint configs** in the embed: lighter motion/resolution on mobile.

### Optimizations
- OffscreenCanvas + worker rendering (panel never janks the canvas; falls back gracefully).
- Shader permutation cache keyed by (motion, material, shape); precompile neighbors with
  `KHR_parallel_shader_compile` for stutter-free switching.
- Tile-based still rendering for ≥8K exports (avoid max-texture/canvas limits).
- WebGL2 RG16F flowmap (removes 8-bit velocity quantization) — already §6.1.
- Idle throttle: 30 fps when pointer idle and |speed| low; full stop off-screen (existing).
- Perf/accessibility score in-studio: live GPU-cost meter, battery hint, reduced-motion
  compliance check — productizes §6 hardening.

### Three bets if forced to choose
**Text/logo masking, layer compositing, image→preset.** Together they convert the product from
"pretty gradient toy" into "tool designers reach for," and all three sit directly on
architecture already planned (FBO pipeline, config schema, OKLCH color utils).

---

## 10. Launch & distribution plan

### Hosting
Static host, free tier: **Cloudflare Pages / Netlify / Vercel / GitHub Pages** (single HTML now,
Vite build later — same answer). Buy a short domain early; every channel below links to it.

### Built-in growth loop (build at M3 with the embed)
- Optional, dismissible **"made with …" credit link** in the exported embed (one line in the
  embed builder; default ON with an easy config flag to disable). Every deployed background
  becomes a referral.
- **Share links are marketing**: `/#s=…` URLs mean every shared look opens the studio itself.
  Add an OG image per share link when/if the shell moves to Next (§5).
- The studio exports its own promo media: seamless loop videos + 4K stills.

### Channel order (phased — don't launch everything at once)

**Phase A — while building (post-M1, studio at parity online):**
- **CodePen**: publish exported backgrounds + a mini studio pen linking to the full tool.
  WebGL gradient/fluid work trends there; it's the same audience.
- **X/Twitter creative-coding** (#creativecoding, #webgl): short screen captures of the fluid
  cursor; post progress threads — build-in-public works in this niche.
- **Reddit warm-up**: r/creativecoding, r/generative (show outputs, not the tool pitch).

**Phase B — feature launch (post-M2: presets + share links live):**
- **Product Hunt** launch — gallery = loop videos; first comment = the zero-dependency
  raw-WebGL story + share-link demo chain.
- **Hacker News "Show HN"** — lead with the technical angle ("zero-dependency WebGL background
  studio, <15 KB embeds"); HN respects the no-framework core.
- **Reddit main wave**: r/web_design, r/webdev, r/SideProject, r/InternetIsBeautiful.
- **Design directories**: toools.design and similar free-resource lists (evergreen referrers).

**Phase C — where the buyers are (post-M3: embed package):**
- **Webflow / Framer / Wix Studio communities** — highest-intent users (designers who want
  copy-paste animated backgrounds). Framer marketplace = first monetization experiment
  (paid component).
- **Figma Community** — once the plugin from §9 ships, it's its own distribution surface.
- **Short-form video** (Reels/TikTok/Shorts): batch-export loops; "oddly satisfying" gradient
  content compounds slowly but costs nothing — the tool generates the content.
- **Dribbble/Behance**: output collections linking back.

### Channel notes
- Each launch should demo a *different* hero feature (PH: presets/share; HN: engine/embeds;
  Webflow/Framer: copy-paste workflow) so repeat audiences see something new.
- OBS transparent-overlay mode (§9) opens the streamer channel — announce it in streaming
  communities separately when it ships.
- Measure with a privacy-light analytics (e.g., Plausible) from day one; the embed itself stays
  analytics-free — that's part of the <15 KB promise.
