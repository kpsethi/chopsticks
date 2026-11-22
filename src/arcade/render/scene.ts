import { AdditiveBlending, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  CylinderGeometry, DirectionalLight, Group, HemisphereLight, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PlaneGeometry, PMREMGenerator, Points, Scene, ShaderMaterial,
  SphereGeometry, Sprite, SpriteMaterial, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ARCADE as C } from '../constants';
import { approach, type ArcadeEvent, type ArcadeGame } from '../game';
import { ArcadeCamera } from './camera';
import { BoosterMesh, TowerMesh } from './meshes';
import { Effects } from './effects';
import { Hazards } from './hazards';
import { createGlowTexture } from './textures';

export class ArcadeRenderer {
  readonly renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  readonly view = new ArcadeCamera();
  private readonly scene = new Scene();
  private readonly tower = new TowerMesh();
  private readonly booster = new BoosterMesh();
  private readonly effects = new Effects(this.booster.group);
  private readonly hazards = new Hazards();
  private readonly guideMaterial = new MeshBasicMaterial({ color: 0x73929f, transparent: true, opacity: 0.72, toneMapped: false });
  private readonly guide = new Mesh(new BoxGeometry(0.65, 1, 0.2), this.guideMaterial);
  private readonly burnLine = new Group();
  private readonly markerMaterial = new MeshBasicMaterial({ color: 0xffc171, toneMapped: false });
  private readonly marker = new Group();
  private readonly skyMat: ShaderMaterial;
  private readonly starMat: ShaderMaterial;
  private readonly coastMat: ShaderMaterial;
  private readonly fog: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly streaks = new Group();
  private readonly windMaterial = new MeshBasicMaterial({ color: 0xe6caa2, transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  private readonly environment;
  private readonly textures: CanvasTexture[] = [];
  private spawnHeight = C.startHeight as number;
  private gustDirection = 1;
  private smoothPlume = 0;
  private visualTime = 0;

  constructor(host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x040b18, 1);
    this.renderer.domElement.setAttribute('aria-label', 'Booster descending above a coastal launch tower');
    host.prepend(this.renderer.domElement);

    const room = new RoomEnvironment(this.renderer), pmrem = new PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04); this.scene.environment = this.environment.texture;
    room.dispose(); pmrem.dispose();

    // Moonlit rim + warm coastal twilight / pad bounce lights.
    const moon = new DirectionalLight(0xc2dcff, 3.8); moon.position.set(160, 260, 150);
    const warm = new DirectionalLight(0xffae5c, 2.8); warm.position.set(-80, -25, 95);
    const rim = new DirectionalLight(0x6da6ff, 1.4); rim.position.set(-140, 180, -120);
    this.scene.add(moon, warm, rim, new HemisphereLight(0x8baee0, 0x1b2434, 2.1), new AmbientLight(0x526985, 0.55));

    this.scene.add(
      this.tower.group, this.booster.group, this.effects.explosion, this.effects.world,
      this.hazards.group, this.guide, this.burnLine, this.marker,
    );

    // Sleek glowing burn-height indicator with side ticks.
    const burnMat = new MeshBasicMaterial({ color: 0xff684a, transparent: true, opacity: 0.92, toneMapped: false });
    const burnBar = new Mesh(new BoxGeometry(24, 1.35, 0.3), burnMat);
    const leftTick = new Mesh(new BoxGeometry(1.1, 4.6, 0.3), burnMat); leftTick.position.x = -12;
    const rightTick = new Mesh(new BoxGeometry(1.1, 4.6, 0.3), burnMat); rightTick.position.x = 12;
    this.burnLine.add(burnBar, leftTick, rightTick);

    // Brackets span the catch window for the pins' centre; render() moves them per level.
    for (const x of [-C.catchOffset, C.catchOffset]) {
      const mark = new Mesh(new BoxGeometry(0.75, 7.2, 0.5), this.markerMaterial); mark.position.set(x, 2.5, 5);
      this.marker.add(mark);
    }
    const line = new Mesh(new BoxGeometry(2, 0.75, 0.5), this.markerMaterial); line.position.set(0, -1, 5);
    this.marker.add(line);

    this.skyMat = this.buildSkyAndMoon();
    this.starMat = this.buildStars();
    this.coastMat = this.buildCoastAndComplex();

    // Volumetric-looking scrolling marine-layer cloud band (Low cloud twist).
    this.fog = new Mesh(new PlaneGeometry(210, C.fogTop - C.fogBottom), new ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        tint: { value: new Color(0x889fb8) },
        warmTint: { value: new Color(0xd8a882) },
      },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `
        uniform float uTime;
        uniform vec3 tint;
        uniform vec3 warmTint;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p){
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.05; a *= 0.5; }
          return v;
        }
        void main(){
          float yMask = sin(vUv.y * 3.14159);
          float xMask = smoothstep(0.0, 0.16, vUv.x) * smoothstep(0.0, 0.16, 1.0 - vUv.x);
          float cloud = fbm(vec2(vUv.x * 5.2 - uTime * 0.07, vUv.y * 2.6));
          float wisps = fbm(vec2(vUv.x * 9.5 - uTime * 0.12 + 3.1, vUv.y * 4.5));
          float density = smoothstep(0.24, 0.78, cloud * 0.72 + wisps * 0.38);
          vec3 col = mix(warmTint, tint, smoothstep(0.15, 0.85, vUv.y));
          gl_FragColor = vec4(col, yMask * xMask * (0.28 + 0.5 * density) * 0.72);
        }
      `,
    }));
    this.fog.position.set(0, (C.fogTop + C.fogBottom) / 2, 14);
    this.scene.add(this.fog);

    for (let i = 0; i < 18; i++) {
      const streak = new Mesh(new BoxGeometry(10 + i % 4 * 5, 0.28, 0.1), this.windMaterial);
      streak.position.set(i * 37 % 160 - 80, i * 29 % 330, -8);
      this.streaks.add(streak);
    }
    this.scene.add(this.streaks);
    this.resize();
  }

  private buildSkyAndMoon(): ShaderMaterial {
    const skyMat = new ShaderMaterial({
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uHeat: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime;
        uniform float uHeat;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main(){
          float h = clamp(vUv.y, 0.0, 1.0);
          vec3 zenith = vec3(0.018, 0.04, 0.095);
          vec3 midSky = vec3(0.055, 0.115, 0.215);
          vec3 dusk   = mix(vec3(0.24, 0.22, 0.28), vec3(0.38, 0.21, 0.22), uHeat);
          vec3 horiz  = mix(vec3(0.68, 0.44, 0.34), vec3(0.86, 0.42, 0.27), uHeat);
          vec3 col = mix(horiz, dusk, smoothstep(0.0, 0.18, h));
          col = mix(col, midSky, smoothstep(0.14, 0.46, h));
          col = mix(col, zenith, smoothstep(0.42, 0.95, h));

          // Soft warm coastal dusk glow slightly right of centre along horizon.
          float sunGlow = exp(-pow((vUv.x - 0.62) * 2.5, 2.0)) * exp(-h * 7.5);
          col += mix(vec3(0.42, 0.24, 0.14), vec3(0.55, 0.22, 0.12), uHeat) * sunGlow * 0.72;

          // Distant drifting twilight cirrus clouds near horizon.
          float c1 = noise(vec2(vUv.x * 7.5 + uTime * 0.004, h * 18.0));
          float c2 = noise(vec2(vUv.x * 14.0 - uTime * 0.003, h * 34.0));
          float cirrus = smoothstep(0.55, 0.85, c1 * 0.65 + c2 * 0.35) * smoothstep(0.02, 0.14, h) * smoothstep(0.45, 0.18, h);
          col = mix(col, mix(dusk, horiz, 0.55), cirrus * 0.38);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new Mesh(new PlaneGeometry(5400, 2200), skyMat);
    sky.position.set(0, C.groundY + 1090, -1460);
    this.scene.add(sky);

    // Pale moon + atmospheric lunar halo in the upper-right sky.
    const moonGlow = createGlowTexture('#eef6ff', '#9ec5ff66', '#3366bb00');
    this.textures.push(moonGlow);
    const moonDisc = new Mesh(new SphereGeometry(18, 20, 16), new MeshBasicMaterial({ color: 0xeaf4ff, toneMapped: false }));
    moonDisc.position.set(340, 460, -1380);
    const moonHalo = new Sprite(new SpriteMaterial({ map: moonGlow, transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    moonHalo.position.set(340, 460, -1375);
    moonHalo.scale.setScalar(195);
    this.scene.add(moonDisc, moonHalo);

    return skyMat;
  }

  private buildStars(): ShaderMaterial {
    const count = 360;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = [new Color(0xdcebff), new Color(0xfff1d6), new Color(0xb7d5ff), new Color(0xffffff)];
    for (let i = 0; i < count; i++) {
      const s1 = Math.sin(i * 127.1 + 1.3) * 43758.5453;
      const s2 = Math.sin(i * 269.5 + 4.7) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const r2 = s2 - Math.floor(s2);
      positions[i * 3] = (r1 * 2 - 1) * 1400;
      positions[i * 3 + 1] = 60 + Math.pow(r2, 0.85) * 980;
      positions[i * 3 + 2] = -1320;
      sizes[i] = 1.6 + ((i * 19) % 10) * 0.36;
      phases[i] = i * 1.91;
      const c = palette[i % palette.length];
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new BufferAttribute(phases, 1));
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3));

    const starMat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute vec3 aColor;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 1.8 + aPhase));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float a = smoothstep(0.5, 0.05, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    this.scene.add(new Points(geometry, starMat));
    return starMat;
  }

  private buildCoastAndComplex(): ShaderMaterial {
    // Unified coastal land + curved surf shoreline + animated twilight ocean with live engine reflection.
    const coastMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHeat: { value: 0 },
        uBoosterX: { value: 24 },
        uBoosterY: { value: 140 },
        uPlume: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uHeat;
        uniform float uBoosterX;
        uniform float uBoosterY;
        uniform float uPlume;
        varying vec3 vWorld;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        void main() {
          vec2 p = vWorld.xz;
          // Gentle curved coastal shoreline just east of the launch pad.
          float shore = 64.0 + sin(p.y * 0.008) * 16.0 + cos(p.y * 0.0032) * 24.0 - p.y * 0.035;
          float dCoast = p.x - shore;
          float waterMask = smoothstep(-5.0, 7.0, dCoast);

          // Coastal dunes / marshland texture.
          float terrainNoise = noise(p * 0.025) * 0.6 + noise(p * 0.07) * 0.4;
          vec3 landCol = mix(vec3(0.06, 0.105, 0.135), vec3(0.10, 0.145, 0.175), terrainNoise);
          // Sand beach strip right along the shoreline.
          float sand = smoothstep(-26.0, -4.0, dCoast) * (1.0 - waterMask);
          landCol = mix(landCol, vec3(0.16, 0.18, 0.21), sand * 0.65);

          // Animated ocean waves & twilight/lunar specular shimmer.
          float w1 = sin(p.x * 0.16 - uTime * 1.45 + noise(p * 0.04) * 3.0);
          float w2 = sin(p.y * 0.09 + p.x * 0.05 + uTime * 1.05);
          float w3 = noise(vec2(p.x * 0.12 - uTime * 0.45, p.y * 0.06 + uTime * 0.2));
          float wave = w1 * 0.35 + w2 * 0.35 + (w3 - 0.5) * 0.9;

          vec3 deepSea = vec3(0.035, 0.09, 0.165);
          vec3 crestSea = vec3(0.085, 0.175, 0.275);
          vec3 seaCol = mix(deepSea, crestSea, clamp(0.45 + wave * 0.38, 0.0, 1.0));

          // Moonlight glitter path on the eastern water.
          float moonPath = exp(-pow((p.x - 210.0) * 0.006, 2.0)) * smoothstep(200.0, -900.0, p.y);
          float sparkle = pow(max(0.0, wave * 0.55 + 0.45), 5.0);
          seaCol += vec3(0.45, 0.58, 0.78) * moonPath * (0.14 + sparkle * 0.42);

          // Dusk sky warmth reflected softly across the distant ocean.
          float horizonFade = smoothstep(80.0, -1350.0, p.y);
          vec3 horizonCol = mix(vec3(0.68, 0.44, 0.34), vec3(0.86, 0.42, 0.27), uHeat);
          seaCol = mix(seaCol, horizonCol * 0.62, horizonFade * 0.45);

          // Gently lapping shoreline surf foam.
          float surfWave = sin(uTime * 1.8 - dCoast * 0.55 + noise(p * 0.06) * 3.5);
          float foam = smoothstep(10.0, 0.0, abs(dCoast - 2.0)) * smoothstep(0.25, 0.85, surfWave) * 0.42;
          seaCol += vec3(0.65, 0.78, 0.88) * foam;

          vec3 col = mix(landCol, seaCol, waterMask);

          // Warm launch-pad sodium light spill around the complex.
          float padDist = length((p - vec2(-18.0, 0.0)) * vec2(1.0, 1.4));
          col += vec3(0.32, 0.21, 0.11) * exp(-padDist * 0.011) * (1.0 - waterMask * 0.45);

          // Live rocket engine plume reflection on the ground and shimmering ocean waves!
          float heightFactor = 1.0 / (1.0 + max(0.0, uBoosterY + 28.0) * 0.0075);
          float xSpread = mix(0.014, 0.008, waterMask);
          float plumeGlow = exp(-pow((p.x - uBoosterX) * xSpread, 2.0) - pow(p.y * 0.009, 2.0));
          float rippleBoost = mix(1.0, 0.65 + 0.9 * max(0.0, wave), waterMask);
          col += vec3(1.0, 0.62, 0.28) * uPlume * heightFactor * plumeGlow * rippleBoost * 0.78;

          // Seamless atmospheric horizon fog blending into the exact twilight horizon color.
          float fogAmt = smoothstep(-240.0, -1430.0, p.y);
          col = mix(col, horizonCol, fogAmt * fogAmt);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const coast = new Mesh(new PlaneGeometry(4000, 2100), coastMat);
    coast.rotation.x = -Math.PI / 2;
    coast.position.set(0, C.groundY - 0.5, -400);
    this.scene.add(coast);

    // Concrete launch pad, recessed flame trench & blast wall.
    const concrete = new MeshStandardMaterial({ color: 0x324250, roughness: 0.88, metalness: 0.1 });
    const apron = new MeshStandardMaterial({ color: 0x263440, roughness: 0.92 });
    const trenchMat = new MeshStandardMaterial({ color: 0x101822, roughness: 0.95 });
    const tankSteel = new MeshStandardMaterial({ color: 0xc2d0dc, metalness: 0.45, roughness: 0.35 });
    const darkSteel = new MeshStandardMaterial({ color: 0x223342, metalness: 0.5, roughness: 0.6 });
    const windowGlow = new MeshBasicMaterial({ color: 0xffcf88, toneMapped: false });

    const pad = new Mesh(new BoxGeometry(134, 1.6, 74), concrete);
    pad.position.set(-15, C.groundY, 0);
    const padBorder = new Mesh(new BoxGeometry(142, 0.8, 82), apron);
    padBorder.position.set(-15, C.groundY - 0.3, 0);
    const trench = new Mesh(new BoxGeometry(36, 1.75, 22), trenchMat);
    trench.position.set(0, C.groundY + 0.05, 0);
    this.scene.add(padBorder, pad, trench);

    // Perimeter sodium lamps + soft glow halos.
    const lamps = new InstancedMesh(new BoxGeometry(0.95, 0.55, 1.15), new MeshBasicMaterial({ color: 0xffc476, toneMapped: false }), 44);
    const dummy = new Object3D();
    for (let i = 0; i < 44; i++) {
      dummy.position.set(-78 + (i % 22) * 6, C.groundY + 1.25, i < 22 ? 35 : -35);
      dummy.updateMatrix();
      lamps.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(lamps);

    const lampGlow = createGlowTexture('#fff3d4', '#ffb86288', '#ff7c2000');
    this.textures.push(lampGlow);
    const padHaloMat = new SpriteMaterial({ map: lampGlow, transparent: true, opacity: 0.42, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 7; i++) {
      const h = new Sprite(padHaloMat);
      h.position.set(-72 + i * 20, C.groundY + 2.5, 35);
      h.scale.setScalar(13);
      this.scene.add(h);
    }

    // Orbital propellant tank farm (vertical cryo silos + spherical LOX/CH4 tanks) west of the tower.
    for (let i = 0; i < 4; i++) {
      const x = -112 - i * 16;
      const z = -52 - (i % 2) * 14;
      const silo = new Mesh(new CylinderGeometry(4.2, 4.2, 24, 14), tankSteel);
      silo.position.set(x, C.groundY + 12, z);
      const dome = new Mesh(new SphereGeometry(4.2, 14, 8), tankSteel);
      dome.position.set(x, C.groundY + 24, z);
      this.scene.add(silo, dome);
    }
    for (let i = 0; i < 2; i++) {
      const x = -182 - i * 26;
      const z = -66 - i * 12;
      const sphere = new Mesh(new SphereGeometry(8.2, 16, 12), tankSteel);
      sphere.position.set(x, C.groundY + 11.5, z);
      const stand = new Mesh(new CylinderGeometry(5.5, 7, 5, 8), darkSteel);
      stand.position.set(x, C.groundY + 2.5, z);
      this.scene.add(sphere, stand);
    }

    // Distant launch-control buildings with subtle lit warm windows.
    for (let i = 0; i < 6; i++) {
      const w = 18 + (i % 3) * 8, h = 9 + (i % 3) * 5;
      const x = -126 - i * 38, z = -105 - i * 22;
      const building = new Mesh(new BoxGeometry(w, h, 18), darkSteel);
      building.position.set(x, C.groundY + h / 2, z);
      const windows = new Mesh(new BoxGeometry(w * 0.72, 1.1, 0.4), windowGlow);
      windows.position.set(x, C.groundY + h * 0.68, z + 9.1);
      this.scene.add(building, windows);
    }

    return coastMat;
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.view.frame(w, h, this.spawnHeight);
    this.starMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }

  event(event: ArcadeEvent): void {
    if (event.type === 'crash') this.effects.burst(event.x, event.y);
    if (event.type === 'catch') this.effects.celebrate(this.marker.position.x + event.dx, event.perfect);
    if (event.type === 'gustWarning' || event.type === 'gust') this.gustDirection = Math.sign(event.acceleration) || 1;
    if (event.type === 'spawn') {
      this.effects.reset(); this.spawnHeight = event.y; this.view.frame(this.view.width, this.view.height, this.spawnHeight);
    }
  }

  render(game: ArcadeGame, dt: number, preview = false): void {
    this.visualTime += dt;
    const t = preview ? this.visualTime : game.time;
    const b = game.booster;
    const c = game.conditions;
    const activeBurn = b.burning || preview;
    const activeSpool = !preview && b.spooling;

    this.booster.update(game, preview);
    this.tower.update(game, dt, t);
    this.hazards.update(game);
    this.effects.update(dt, t, activeBurn, activeSpool, b.x, b.y, game.wind.base + game.wind.gust);

    // Update atmospheric & ocean shaders.
    const heat = Math.min(1, (game.level - 1) / 15);
    const targetPlume = activeBurn ? 1 : activeSpool ? 0.35 : 0;
    this.smoothPlume += (targetPlume - this.smoothPlume) * Math.min(1, dt * 14 + (preview ? 1 : 0));
    this.skyMat.uniforms.uTime.value = t;
    this.skyMat.uniforms.uHeat.value = heat;
    this.starMat.uniforms.uTime.value = t;
    this.coastMat.uniforms.uTime.value = t;
    this.coastMat.uniforms.uHeat.value = heat;
    this.coastMat.uniforms.uBoosterX.value = b.x;
    this.coastMat.uniforms.uBoosterY.value = b.y;
    this.coastMat.uniforms.uPlume.value = this.smoothPlume;

    // Flight guide, burn line, and catch brackets.
    this.guide.visible = game.state === 'dropping' && !game.flare.active;
    this.guide.position.set(b.x, Math.max(0, b.y) / 2, 2); this.guide.scale.y = Math.max(0.01, b.y);
    const cue = approach(b.y, b.vy, c.thrust, c.gravity, b.burning ? 0 : c.ignitionLag);
    this.guideMaterial.color.setHex(cue.cue === 'good' ? 0x75f4c5 : cue.cue === 'burn' ? 0xffb347 : 0xff5a45);
    this.burnLine.visible = this.guide.visible && !b.burning && cue.burnHeight > 2 && cue.burnHeight < b.y;
    this.burnLine.position.set(b.x, cue.burnHeight - C.belowPins, 3);
    this.marker.position.x = game.arms.x;
    this.marker.children[0].position.x = -c.catchOffset; this.marker.children[1].position.x = c.catchOffset;
    this.marker.children[2].scale.x = c.catchOffset;
    this.markerMaterial.color.setHex(game.flare.active ? 0x56606c : Math.abs(b.x - game.arms.x) <= c.catchOffset ? 0x75f4c5 : 0xffc171);

    // Cloud band & wind streaks.
    this.fog.visible = !!game.fogBand;
    if (game.fogBand) {
      this.fog.position.y = (game.fogBand.bottom + game.fogBand.top) / 2;
      this.fog.scale.y = (game.fogBand.top - game.fogBand.bottom) / (C.fogTop - C.fogBottom);
      this.fog.material.uniforms.uTime.value = game.time;
    }
    this.streaks.visible = Math.abs(game.wind.base) > 0 || game.wind.warning || Math.abs(game.wind.gust) > 0;
    this.windMaterial.opacity = game.wind.warning ? 0.35 + 0.3 * Math.sin(game.time * 25) : game.wind.gust ? 0.52 : 0.14;
    const direction = Math.sign(game.wind.gust || (game.wind.warning ? this.gustDirection : 0) || game.wind.base) || 1;
    for (let i = 0; i < this.streaks.children.length; i++) {
      this.streaks.children[i].position.x = ((i * 37 + game.time * direction * 18) % 180 + 180) % 180 - 90;
    }
    this.view.shake(this.effects.shake, game.time);
    this.renderer.render(this.scene, this.view.camera);
  }

  dispose(): void {
    this.tower.dispose();
    this.booster.dispose();
    this.effects.dispose();
    this.hazards.dispose();
    for (const tex of this.textures) tex.dispose();
    this.scene.traverse(object => {
      if (object instanceof Mesh || object instanceof Points || object instanceof Sprite) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) for (const m of object.material) m.dispose(); else object.material.dispose();
      }
    });
    this.environment.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
