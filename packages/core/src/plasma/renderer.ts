// PlasmaRenderer — framework-free WebGL1 engine, ported verbatim from the legacy HTML.
// Config-as-truth: setConfig() is the only way to change the look. Pointer handling,
// the flowmap ping-pong, the rAF loop, and adaptive scale all live here (zero React).
import { VERT, FLOW_FRAG, FIELD_NAMES, MATERIAL_NAMES, buildFrag } from './shaders.js';
import { SHAPE_NAMES } from './data.js';
import { makeProgram, hex2rgb } from './gl.js';
import { COMPOSITE_FRAG, OVERLAY_TYPE_INDEX, OVERLAY_BLEND_INDEX } from './overlay.js';
import type { CoreConfig } from './config.js';
import { type CursorMode, CURSOR_MODES, defaultConfig } from './config-defaults.js';

const FW = 256; // flowmap resolution

export class PlasmaRenderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private buf!: WebGLBuffer; // set in initGL() (constructor + context restore)
  private program: WebGLProgram | null = null;
  private currentFrag = '';
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private aposLoc = -1;

  // flowmap (cursor "true flowmap" — gotcha §4.3/§4.12: LINEAR-filtered ping-pong)
  private flowProg: WebGLProgram | null = null;
  private flowRead: WebGLTexture | null = null;
  private flowWrite: WebGLTexture | null = null;
  private flowFBO: WebGLFramebuffer | null = null;
  private flu: Record<string, WebGLUniformLocation | null> = {};
  private flowPos = -1;
  private flowFrames = 0;

  // overlay composite (plasma → FBO → composite → screen)
  private compProg: WebGLProgram | null = null;
  private cloc: Record<string, WebGLUniformLocation | null> = {};
  private compPos = -1;
  private plasmaTex: WebGLTexture | null = null;
  private plasmaFBO: WebGLFramebuffer | null = null;
  private ptW = 0;
  private ptH = 0;
  private ovType = 0;
  private ovBlend = 0;
  private ovOpacity = 1;
  private ovColA: [number, number, number] = [0, 0, 0];
  private ovAlphaA = 0.5;
  private ovColB: [number, number, number] = [0, 0, 0];
  private ovAlphaB = 0;
  private ovAngle = 0;
  private ovCenter: [number, number] = [0.5, 0.5];
  private ovRadius = 0.75;

  // config + derived numeric state (legacy internal units)
  private cfg: CoreConfig = defaultConfig;
  private fieldIdx = 0;
  private matIdx = 0;
  private shapeIdx = 0;
  private palette: string[] = [];
  private bg: [number, number, number] = [0, 0, 0];
  private speed = 1;
  private scale = 1;
  private swirl = 1;
  private turb = 1;
  private detail = 1;
  private flowAng = 0;
  private flowAmt = 0;
  private vis = 1;
  private cover = 1;
  private noise = 0;
  private grav = 0;
  private contrast = 1;
  private rot = 0;
  private centerX = 0;
  private centerY = 0;
  private cursorOn = true;
  private cursorStr = 1;
  private mouseRad = 0.4;
  private curTrail = 0.4;
  private curChurn = 0.5;
  private curLag = 0.4;
  private curCM = new Float32Array([1, 0, 0, 0, 0]);

  // runtime
  private tAccum = 0;
  private last = 0;
  private raf = 0;
  private running = false; // rAF currently scheduled
  private wantRunning = false; // host asked to run (start without stop)
  private onScreen = true; // IntersectionObserver — pause the loop when off-screen
  private contextLost = false;
  private io: IntersectionObserver | null = null;
  private paused = false;
  private exporting = false;
  private disposed = false;
  private renderScale = 1;
  private emaDt = 1 / 60;
  private perfFrames = 0;
  private dirty = true;

  // pointer
  private mouseX = 0;
  private mouseY = 0;
  private mTX = 0;
  private mTY = 0;
  private mouseAmt = 0;
  private mouseTarget = 0;
  private pmx = 0;
  private pmy = 0;
  private mvX = 0;
  private mvY = 0;
  private trailReady = false;

  private readonly flat = new Float32Array(24);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL1 not available');
    this.gl = gl;

    this.initGL();

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerout', this.onPointerOut);
    canvas.addEventListener('webglcontextlost', this.onContextLost as EventListener);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored as EventListener);

    // Stop the loop while the canvas is off-screen (saves CPU/GPU in studio + embed).
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(
        (entries) => {
          this.onScreen = entries[entries.length - 1].isIntersecting;
          if (this.onScreen) this.maybeRun();
          else this.cancelRaf();
        },
        { threshold: 0 },
      );
      this.io.observe(canvas);
    }
  }

  /** (Re)create all GL resources from `this.cfg`. Re-run on context restore. */
  private initGL() {
    const gl = this.gl;
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.initFlow();
    this.initComposite();
    this.applyConfigInternal(this.cfg);
    this.recompile();
    this.resize();
  }

  // WebGL context-loss recovery — config-as-truth makes the rebuild trivial.
  private onContextLost = (e: Event) => {
    e.preventDefault(); // required so the context can be restored
    this.contextLost = true;
    this.cancelRaf();
  };
  private onContextRestored = () => {
    if (this.disposed) return;
    this.contextLost = false;
    this.program = null;
    this.flowProg = null;
    this.compProg = null;
    this.initGL();
    this.maybeRun();
  };

  // ---- flowmap ----
  private makeFlowTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FW, FW, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private initFlow() {
    const gl = this.gl;
    this.flowProg = makeProgram(gl, VERT, FLOW_FRAG);
    if (!this.flowProg) return;
    gl.useProgram(this.flowProg);
    this.flowPos = gl.getAttribLocation(this.flowProg, 'a_pos');
    for (const k of ['prev', 'fall', 'diss', 'aspect', 'fmouse', 'fvel', 'present'] as const) {
      this.flu[k] = gl.getUniformLocation(this.flowProg, 'u_' + k);
    }
    this.flowRead = this.makeFlowTex();
    this.flowWrite = this.makeFlowTex();
    this.flowFBO = gl.createFramebuffer();
    for (const tex of [this.flowRead, this.flowWrite]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.flowFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, FW, FW);
      gl.clearColor(0.5, 0.5, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---- overlay composite ----
  private initComposite() {
    const gl = this.gl;
    this.compProg = makeProgram(gl, VERT, COMPOSITE_FRAG);
    if (!this.compProg) return;
    gl.useProgram(this.compProg);
    this.compPos = gl.getAttribLocation(this.compProg, 'a_pos');
    const U = (n: string) => gl.getUniformLocation(this.compProg!, n);
    this.cloc = {
      plasma: U('u_plasma'), type: U('u_ovType'), blend: U('u_ovBlend'), opacity: U('u_ovOpacity'),
      colA: U('u_ovColA'), alphaA: U('u_ovAlphaA'), colB: U('u_ovColB'), alphaB: U('u_ovAlphaB'),
      angle: U('u_ovAngle'), center: U('u_ovCenter'), radius: U('u_ovRadius'),
    };
    this.plasmaFBO = gl.createFramebuffer();
    this.plasmaTex = null; // force ensurePlasmaTarget to (re)allocate
    this.ptW = 0;
    this.ptH = 0;
  }

  private ensurePlasmaTarget(w: number, h: number) {
    const gl = this.gl;
    if (this.plasmaTex && this.ptW === w && this.ptH === h) return;
    if (!this.plasmaTex) this.plasmaTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.plasmaTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.ptW = w;
    this.ptH = h;
  }

  private updateFlow() {
    const gl = this.gl;
    if (!this.flowProg) return;
    const ar = this.canvas.width / this.canvas.height;
    const mfx = this.mouseX / ar * 0.5 + 0.5;
    const mfy = this.mouseY * 0.5 + 0.5;
    const vfx = this.mvX / ar * 0.5 * 10.0;
    const vfy = this.mvY * 0.5 * 10.0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.flowFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.flowWrite, 0);
    gl.viewport(0, 0, FW, FW);
    gl.useProgram(this.flowProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.flowPos);
    gl.vertexAttribPointer(this.flowPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.flowRead);
    gl.uniform1i(this.flu.prev!, 0);
    gl.uniform1f(this.flu.fall!, Math.max(0.03, this.mouseRad * 0.5));
    gl.uniform1f(this.flu.diss!, 0.85 + 0.13 * this.curTrail);
    gl.uniform1f(this.flu.aspect!, ar);
    gl.uniform2f(this.flu.fmouse!, mfx, mfy);
    gl.uniform2f(this.flu.fvel!, vfx * this.cursorStr, vfy * this.cursorStr);
    gl.uniform1f(this.flu.present!, this.cursorOn && !this.exporting ? this.mouseAmt * 0.8 : 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const t = this.flowRead;
    this.flowRead = this.flowWrite;
    this.flowWrite = t;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---- program ----
  private recompile() {
    const gl = this.gl;
    this.currentFrag = buildFrag(this.fieldIdx, this.matIdx);
    const p = makeProgram(gl, VERT, this.currentFrag);
    if (!p) return;
    if (this.program) gl.deleteProgram(this.program);
    this.program = p;
    gl.useProgram(p);
    this.aposLoc = gl.getAttribLocation(p, 'a_pos');
    const U = (n: string) => gl.getUniformLocation(p, n);
    this.loc = {
      time: U('u_time'), res: U('u_res'), speed: U('u_speed'), scale: U('u_scale'),
      colors: U('u_colors[0]'), count: U('u_count'), bg: U('u_bg'),
      detail: U('u_detail'), turb: U('u_turb'), swirl: U('u_swirl'), flow: U('u_flow'),
      vis: U('u_vis'), cover: U('u_cover'), noise: U('u_noise'), grav: U('u_gravity'),
      shape: U('u_shape'), contrast: U('u_contrast'), center: U('u_center'), rot: U('u_rot'),
      mouse: U('u_mouse'), mouseAmt: U('u_mouseAmt'), cm: U('u_cm[0]'), mouseRad: U('u_mouseRad'),
      curChurn: U('u_curChurn'), curStr: U('u_curStr'), fmap: U('u_fmap'),
    };
  }

  private flowVec(): [number, number] {
    const a = this.flowAng * Math.PI / 180;
    return [-Math.cos(a) * this.flowAmt * 0.3, -Math.sin(a) * this.flowAmt * 0.3];
  }

  private setUniforms(timeVal: number) {
    const gl = this.gl;
    const p = this.palette;
    for (let i = 0; i < 8; i++) {
      const c = i < p.length ? hex2rgb(p[i]) : [0, 0, 0];
      this.flat[i * 3] = c[0];
      this.flat[i * 3 + 1] = c[1];
      this.flat[i * 3 + 2] = c[2];
    }
    gl.uniform1f(this.loc.time!, timeVal);
    gl.uniform2f(this.loc.res!, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.speed!, this.speed);
    gl.uniform1f(this.loc.scale!, this.scale);
    gl.uniform3fv(this.loc.colors!, this.flat);
    gl.uniform1i(this.loc.count!, p.length);
    gl.uniform3f(this.loc.bg!, this.bg[0], this.bg[1], this.bg[2]);
    gl.uniform1f(this.loc.detail!, this.detail);
    gl.uniform1f(this.loc.turb!, this.turb);
    gl.uniform1f(this.loc.swirl!, this.swirl);
    gl.uniform1f(this.loc.vis!, this.vis);
    gl.uniform1f(this.loc.cover!, this.cover);
    gl.uniform1f(this.loc.noise!, this.noise);
    gl.uniform1f(this.loc.grav!, this.grav);
    gl.uniform1i(this.loc.shape!, this.shapeIdx);
    gl.uniform1f(this.loc.contrast!, this.contrast);
    gl.uniform2f(this.loc.center!, this.centerX, this.centerY);
    gl.uniform1f(this.loc.rot!, this.rot);
    gl.uniform1fv(this.loc.cm!, this.curCM);
    gl.uniform1f(this.loc.mouseRad!, this.mouseRad);
    gl.uniform1f(this.loc.curChurn!, this.curChurn);
    gl.uniform1f(this.loc.curStr!, this.cursorStr);
    gl.uniform1f(this.loc.mouseAmt!, this.exporting ? 0.0 : 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.flowRead);
    gl.uniform1i(this.loc.fmap!, 0);
    const fv = this.flowVec();
    gl.uniform2f(this.loc.flow!, fv[0], fv[1]);
  }

  /** Render one frame at an explicit time (used by exporters + the loop). */
  renderAt(timeVal: number) {
    const gl = this.gl;
    if (!this.program || !this.compProg) return;
    const w = this.canvas.width, h = this.canvas.height;
    this.ensurePlasmaTarget(w, h);

    // pass 1: plasma → plasmaFBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.plasmaFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.plasmaTex, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.aposLoc);
    gl.vertexAttribPointer(this.aposLoc, 2, gl.FLOAT, false, 0, 0);
    this.setUniforms(timeVal);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // pass 2: composite plasmaTex (+ overlay) → screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.compProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.compPos);
    gl.vertexAttribPointer(this.compPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.plasmaTex);
    gl.uniform1i(this.cloc.plasma!, 0);
    gl.uniform1i(this.cloc.type!, this.ovType);
    gl.uniform1i(this.cloc.blend!, this.ovBlend);
    gl.uniform1f(this.cloc.opacity!, this.ovOpacity);
    gl.uniform3f(this.cloc.colA!, this.ovColA[0], this.ovColA[1], this.ovColA[2]);
    gl.uniform1f(this.cloc.alphaA!, this.ovAlphaA);
    gl.uniform3f(this.cloc.colB!, this.ovColB[0], this.ovColB[1], this.ovColB[2]);
    gl.uniform1f(this.cloc.alphaB!, this.ovAlphaB);
    gl.uniform1f(this.cloc.angle!, this.ovAngle);
    gl.uniform2f(this.cloc.center!, this.ovCenter[0], this.ovCenter[1]);
    gl.uniform1f(this.cloc.radius!, this.ovRadius);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---- config mapping (CoreConfig → internal units, mirrors legacy applyConfig) ----
  private applyConfigInternal(c: CoreConfig) {
    this.fieldIdx = Math.max(0, FIELD_NAMES.indexOf(c.motion));
    this.matIdx = Math.max(0, MATERIAL_NAMES.indexOf(c.material));
    this.shapeIdx = Math.max(0, SHAPE_NAMES.indexOf(c.shape));
    this.palette = c.palette.slice();
    this.bg = hex2rgb(c.bg);
    this.speed = c.speed;
    this.scale = 100 / c.scalePct; // inverted (gotcha §4.9)
    this.swirl = c.swirl;
    this.turb = c.turbulence;
    this.detail = c.detail;
    this.flowAng = c.flow.angleDeg;
    this.flowAmt = c.flow.amount;
    this.vis = c.visibility;
    this.cover = c.coverage;
    this.noise = c.grain;
    this.grav = c.gravity;
    this.contrast = c.contrast;
    this.rot = c.rotateDeg * Math.PI / 180;
    this.centerX = c.center[0];
    this.centerY = c.center[1];
    const ov = c.overlay;
    this.ovType = OVERLAY_TYPE_INDEX[ov.type] ?? 0;
    this.ovBlend = OVERLAY_BLEND_INDEX[ov.blend] ?? 0;
    this.ovOpacity = ov.opacity;
    this.ovColA = hex2rgb(ov.colorA);
    this.ovAlphaA = ov.alphaA;
    this.ovColB = hex2rgb(ov.colorB);
    this.ovAlphaB = ov.alphaB;
    this.ovAngle = (ov.angleDeg * Math.PI) / 180;
    this.ovCenter = [ov.center[0], ov.center[1]];
    this.ovRadius = ov.radius;
    this.cursorOn = c.cursor.on;
    this.cursorStr = c.cursor.strength;
    this.mouseRad = c.cursor.size;
    this.curTrail = c.cursor.trail;
    this.curChurn = c.cursor.turbulence;
    this.curLag = c.cursor.lag;
    for (let i = 0; i < CURSOR_MODES.length; i++) {
      this.curCM[i] = c.cursor.modes.includes(CURSOR_MODES[i] as CursorMode) ? 1 : 0;
    }
  }

  /** The only way to change the look. Recompiles only when motion/material/shape change. */
  setConfig(next: CoreConfig) {
    const prev = this.cfg;
    // speed change must rescale tAccum or the image jumps/recolors (gotcha §4.8)
    if (next.speed !== prev.speed) {
      this.tAccum = prev.speed > 0 ? (this.tAccum * prev.speed) / (next.speed || 1e-6) : 0;
    }
    const needsRecompile =
      next.motion !== prev.motion || next.material !== prev.material || next.shape !== prev.shape;
    this.cfg = next;
    this.applyConfigInternal(next);
    if (needsRecompile) this.recompile();
    this.dirty = true;
  }

  getConfig(): CoreConfig {
    return this.cfg;
  }

  // ---- sizing ----
  resize() {
    const gl = this.gl;
    const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const s = DPR * this.renderScale;
    const cssW = this.canvas.clientWidth || this.canvas.width;
    const cssH = this.canvas.clientHeight || this.canvas.height;
    this.canvas.width = Math.max(1, Math.round(cssW * s));
    this.canvas.height = Math.max(1, Math.round(cssH * s));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = true;
  }

  private adaptScale() {
    let s = this.renderScale;
    if (this.emaDt > 0.027 && s > 0.6) s = Math.max(0.6, s - 0.1);
    else if (this.emaDt < 0.015 && s < 1.0) s = Math.min(1.0, s + 0.1);
    if (Math.abs(s - this.renderScale) > 0.001) {
      this.renderScale = s;
      this.resize();
    }
  }

  // ---- loop ----
  start() {
    if (this.disposed) return;
    this.wantRunning = true;
    this.maybeRun();
  }

  stop() {
    this.wantRunning = false;
    this.cancelRaf();
  }

  /** Begin the rAF loop iff the host wants it AND we're on-screen + have a context. */
  private maybeRun() {
    if (this.disposed || this.running || !this.wantRunning || !this.onScreen || this.contextLost) return;
    this.running = true;
    this.last = now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private cancelRaf() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Pause/resume time advance without tearing down the loop. */
  setPaused(p: boolean) {
    this.paused = p;
    this.last = now();
  }

  seek(t: number) {
    this.tAccum = t;
    this.dirty = true;
    if (!this.running) this.renderAt(this.tAccum);
  }

  /** Exporters flip this so the cursor/flowmap are disabled mid-capture. */
  setExporting(on: boolean) {
    this.exporting = on;
    this.last = now();
  }

  get time() {
    return this.tAccum;
  }

  /** The backing canvas — exporters need it for toBlob()/captureStream(). */
  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  private exportPrev: [number, number] | null = null;

  /** Resize the canvas to an exact export resolution and freeze the live loop. */
  beginExport(w: number, h: number) {
    this.setExporting(true);
    this.exportPrev = [this.canvas.width, this.canvas.height];
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  /** Restore the live canvas size and resume the loop. */
  endExport() {
    if (this.exportPrev) {
      this.canvas.width = this.exportPrev[0];
      this.canvas.height = this.exportPrev[1];
      this.exportPrev = null;
    }
    this.setExporting(false);
    this.resize();
  }

  private frame = (n: number) => {
    if (this.disposed || this.contextLost) {
      this.running = false;
      return;
    }
    if (typeof document !== 'undefined' && document.hidden) {
      this.last = n;
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    const dt = Math.min((n - this.last) / 1000, 0.1);
    this.last = n;
    const fol = 0.05 + (1.0 - this.curLag) * 0.4;
    this.mouseX += (this.mTX - this.mouseX) * fol;
    this.mouseY += (this.mTY - this.mouseY) * fol;
    this.mouseAmt += (this.mouseTarget - this.mouseAmt) * 0.08;
    this.mvX = this.mvX * 0.8 + (this.mouseX - this.pmx) * 0.2;
    this.mvY = this.mvY * 0.8 + (this.mouseY - this.pmy) * 0.2;
    this.pmx = this.mouseX;
    this.pmy = this.mouseY;
    if (this.cursorOn && this.mouseAmt > 0.003) this.flowFrames = 240;
    if (!this.exporting && this.flowFrames > 0) {
      this.updateFlow();
      this.flowFrames--;
      this.dirty = true;
    }
    if (this.cursorOn && this.mouseAmt > 0.005) this.dirty = true;
    if (!this.paused && !this.exporting) {
      this.tAccum += dt;
      this.emaDt = this.emaDt * 0.9 + dt * 0.1;
      if (++this.perfFrames >= 48) {
        this.perfFrames = 0;
        this.adaptScale();
      }
    }
    if (!this.exporting && (!this.paused || this.dirty)) {
      this.renderAt(this.tAccum);
      this.dirty = false;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  // ---- pointer (mapped against the canvas rect so it works inside the artboard) ----
  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ar = rect.width / rect.height;
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;
    this.mTX = (sx * 2 - 1) * ar;
    this.mTY = (1 - sy) * 2 - 1;
    this.mouseTarget = 1;
    this.dirty = true;
    if (!this.trailReady) {
      this.mouseX = this.mTX;
      this.mouseY = this.mTY;
      this.pmx = this.mTX;
      this.pmy = this.mTY;
      this.trailReady = true;
    }
  };

  private onPointerOut = (e: PointerEvent) => {
    if (!e.relatedTarget) this.mouseTarget = 0;
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.io?.disconnect();
    const gl = this.gl;
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerout', this.onPointerOut);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost as EventListener);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored as EventListener);
    if (this.program) gl.deleteProgram(this.program);
    if (this.compProg) gl.deleteProgram(this.compProg);
    if (this.plasmaTex) gl.deleteTexture(this.plasmaTex);
    if (this.plasmaFBO) gl.deleteFramebuffer(this.plasmaFBO);
    if (this.flowProg) gl.deleteProgram(this.flowProg);
    if (this.flowRead) gl.deleteTexture(this.flowRead);
    if (this.flowWrite) gl.deleteTexture(this.flowWrite);
    if (this.flowFBO) gl.deleteFramebuffer(this.flowFBO);
    if (this.buf) gl.deleteBuffer(this.buf);
    this.program = null;
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
