import { AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, DirectionalLight,
  Group, HemisphereLight, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PlaneGeometry, PMREMGenerator, Points, PointsMaterial, Scene, ShaderMaterial, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ARCADE as C } from '../constants';
import { approach, type ArcadeEvent, type ArcadeGame } from '../game';
import { ArcadeCamera } from './camera';
import { BoosterMesh, TowerMesh } from './meshes';
import { Effects } from './effects';
import { Hazards } from './hazards';

export class ArcadeRenderer {
  readonly renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  readonly view = new ArcadeCamera();
  private readonly scene = new Scene();
  private readonly tower = new TowerMesh();
  private readonly booster = new BoosterMesh();
  private readonly effects = new Effects(this.booster.group);
  private readonly hazards = new Hazards();
  private readonly guideMaterial = new MeshBasicMaterial({ color: 0x73929f, transparent: true, opacity: 0.7, toneMapped: false });
  private readonly guide = new Mesh(new BoxGeometry(1, 1, 0.2), this.guideMaterial);
  private readonly burnLine = new Mesh(new BoxGeometry(26, 3, 0.3), new MeshBasicMaterial({ color: 0xff6a4d, transparent: true, opacity: 0.9, toneMapped: false }));
  private readonly markerMaterial = new MeshBasicMaterial({ color: 0xffc171, toneMapped: false });
  private readonly marker = new Group();
  private readonly fog: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly streaks = new Group();
  private readonly windMaterial = new MeshBasicMaterial({ color: 0xe6caa2, transparent: true, opacity: 0.2 });
  private readonly environment;
  private spawnHeight = C.startHeight as number;

  constructor(host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-label', 'Booster descending above a coastal launch tower');
    host.prepend(this.renderer.domElement);
    const room = new RoomEnvironment(this.renderer), pmrem = new PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04); this.scene.environment = this.environment.texture;
    room.dispose(); pmrem.dispose();
    const moon = new DirectionalLight(0xb7d4ff, 3.5); moon.position.set(-80, 220, 140);
    const warm = new DirectionalLight(0xffb162, 2.5); warm.position.set(-70, -30, 80);
    this.scene.add(moon, warm, new HemisphereLight(0x8ba9db, 0x1a2435, 2), new AmbientLight(0x617590, 0.6));
    this.scene.add(this.tower.group, this.booster.group, this.effects.explosion, this.hazards.group, this.guide, this.burnLine, this.marker);
    // Brackets span the catch window for the pins' centre; render() moves them per level.
    for (const x of [-C.catchOffset, C.catchOffset]) {
      const mark = new Mesh(new BoxGeometry(0.8, 7, 0.5), this.markerMaterial); mark.position.set(x, 2.5, 5); this.marker.add(mark);
    }
    const line = new Mesh(new BoxGeometry(2, 0.8, 0.5), this.markerMaterial); line.position.set(0, -1, 5); this.marker.add(line);
    this.buildCoast();
    const stars = new Float32Array(260 * 3);
    for (let i = 0; i < stars.length; i += 3) {
      stars[i] = Math.sin(i * 127.1) * 1100; stars[i + 1] = 15 + ((i * 83.71) % 900); stars[i + 2] = -450;
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(stars, 3));
    this.scene.add(new Points(geometry, new PointsMaterial({ color: 0xc3d5ee, size: 1.5, transparent: true, opacity: 0.6, sizeAttenuation: true })));
    this.fog = new Mesh(new PlaneGeometry(180, C.fogTop - C.fogBottom), new ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { tint: { value: new Color(0x8194ad) } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; uniform vec3 tint; void main(){float a=sin(vUv.y*3.14159); float edge=smoothstep(0.,.15,vUv.x)*smoothstep(0.,.15,1.-vUv.x);gl_FragColor=vec4(tint,a*edge*.45);}',
    }));
    this.fog.position.set(0, (C.fogTop + C.fogBottom) / 2, 14); this.scene.add(this.fog);
    for (let i = 0; i < 16; i++) {
      const streak = new Mesh(new BoxGeometry(9 + i % 4 * 4, 0.25, 0.1), this.windMaterial);
      streak.position.set(i * 37 % 160 - 80, i * 29 % 330, -8); this.streaks.add(streak);
    }
    this.scene.add(this.streaks);
    this.resize();
  }
  private buildCoast(): void {
    const land = new Mesh(new PlaneGeometry(1800, 1600), new MeshStandardMaterial({ color: 0x182c38, roughness: 1 }));
    land.rotation.x = -Math.PI / 2; land.position.set(-850, C.groundY, -550);
    const sea = new Mesh(new PlaneGeometry(1600, 1600), new MeshStandardMaterial({ color: 0x132e47, metalness: 0.5, roughness: 0.45 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(850, C.groundY - 0.5, -550);
    const pad = new Mesh(new BoxGeometry(130, 1.5, 70), new MeshStandardMaterial({ color: 0x354552, roughness: 0.85 }));
    pad.position.set(-15, C.groundY, 0); this.scene.add(land, sea, pad);
    const lamps = new InstancedMesh(new BoxGeometry(0.9, 0.5, 1.1), new MeshBasicMaterial({ color: 0xffc071, toneMapped: false }), 44);
    const dummy = new Object3D();
    for (let i = 0; i < 44; i++) {
      dummy.position.set(-78 + (i % 22) * 6, C.groundY + 1.2, i < 22 ? 34 : -34); dummy.updateMatrix(); lamps.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(lamps);
    const ripples = new InstancedMesh(new BoxGeometry(1, 0.12, 0.6), new MeshBasicMaterial({ color: 0x446078, transparent: true, opacity: 0.4 }), 70);
    for (let i = 0; i < 70; i++) {
      dummy.position.set(70 + (i * 37 % 450), C.groundY, 120 - (i * 53 % 600)); dummy.scale.set(6 + i % 18, 1, 1); dummy.updateMatrix(); ripples.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(ripples);
    for (let i = 0; i < 7; i++) {
      const building = new Mesh(new BoxGeometry(18 + i % 3 * 7, 8 + i % 3 * 5, 18), new MeshStandardMaterial({ color: 0x263747, roughness: 1 }));
      building.position.set(-120 - i * 36, C.groundY + 4, -65 - i * 18); this.scene.add(building);
    }
  }
  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.view.frame(w, h, this.spawnHeight);
  }
  event(event: ArcadeEvent): void {
    if (event.type === 'crash') this.effects.burst(event.x, event.y);
    if (event.type === 'spawn') {
      this.effects.reset(); this.spawnHeight = event.y; this.view.frame(this.view.width, this.view.height, this.spawnHeight);
    }
  }
  render(game: ArcadeGame, dt: number, preview = false): void {
    this.booster.update(game); this.tower.update(game, dt); this.hazards.update(game);
    this.effects.update(dt, game.time, game.booster.burning || preview);
    const b = game.booster;
    const c = game.conditions;
    this.guide.visible = game.state === 'dropping' && !game.flare.active;
    this.guide.position.set(b.x, Math.max(0, b.y) / 2, 2); this.guide.scale.y = Math.max(0.01, b.y);
    const cue = approach(b.y, b.vy, c.thrust, c.gravity);
    this.guideMaterial.color.setHex(cue.cue === 'good' ? 0x75f4c5 : cue.cue === 'burn' ? 0xffb347 : 0xff5a45);
    // Burn when the booster's base touches this line; it rides up as speed grows.
    this.burnLine.visible = this.guide.visible && !b.burning && cue.burnHeight > 2 && cue.burnHeight < b.y;
    this.burnLine.position.set(b.x, cue.burnHeight - C.belowPins, 3);
    this.marker.position.x = game.arms.x;
    this.marker.children[0].position.x = -c.catchOffset; this.marker.children[1].position.x = c.catchOffset;
    this.marker.children[2].scale.x = c.catchOffset;
    this.markerMaterial.color.setHex(game.flare.active ? 0x56606c : Math.abs(b.x - game.arms.x) <= c.catchOffset ? 0x75f4c5 : 0xffc171);
    this.fog.visible = !!game.fogBand;
    this.streaks.visible = Math.abs(game.wind.base) > 0;
    this.windMaterial.opacity = game.wind.warning ? 0.35 + 0.3 * Math.sin(game.time * 25) : game.wind.gust ? 0.5 : 0.13;
    const direction = Math.sign(game.wind.gust || game.wind.base);
    for (let i = 0; i < this.streaks.children.length; i++) {
      this.streaks.children[i].position.x = ((i * 37 + game.time * direction * 18) % 180 + 180) % 180 - 90;
    }
    this.view.shake(this.effects.shake, game.time);
    this.renderer.render(this.scene, this.view.camera);
  }
  dispose(): void {
    this.scene.traverse(object => {
      if (object instanceof Mesh || object instanceof Points) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) for (const m of object.material) m.dispose(); else object.material.dispose();
      }
    });
    this.environment.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
