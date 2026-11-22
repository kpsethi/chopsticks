import { AdditiveBlending, BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, TorusGeometry, Vector3 } from 'three';
import { ARCADE as C } from '../constants';
import type { ArcadeGame } from '../game';
import { createBoosterTexture, createGlowTexture } from './textures';

/** Detailed coastal launch tower with lattice, carriage, glowing sodium rails, floodlights and aviation beacon. */
export class TowerMesh {
  readonly group = new Group();
  private readonly arms = [new Group(), new Group()];
  private readonly flag = new Mesh(new BoxGeometry(6.4, 2.8, 0.14), new MeshBasicMaterial({ color: 0xffb964, toneMapped: false }));
  private readonly tipsMaterial = new MeshBasicMaterial({ color: 0xffbb64, toneMapped: false });
  private readonly tipHaloMaterial: SpriteMaterial;
  private readonly beaconMaterial = new MeshBasicMaterial({ color: 0xff4038, toneMapped: false });
  private readonly beaconHalo: Sprite;
  private readonly textures: CanvasTexture[] = [];
  private closure = 0;

  constructor() {
    const steel = new MeshStandardMaterial({ color: 0x8e9fae, metalness: 0.72, roughness: 0.34 });
    const dark = new MeshStandardMaterial({ color: 0x203140, metalness: 0.55, roughness: 0.55 });
    const sodium = new MeshBasicMaterial({ color: 0xffbd68, toneMapped: false });

    const warmGlow = createGlowTexture('#fff5d6', '#ffb45c99', '#ff7b2000');
    const redGlow = createGlowTexture('#ffd0cc', '#ff3b30aa', '#ff1a1000');
    this.textures.push(warmGlow, redGlow);

    // Structural steel lattice (single instanced draw).
    const beams = new InstancedMesh(new BoxGeometry(1, 1, 1), steel, 180);
    const dummy = new Object3D(), a = new Vector3(), b = new Vector3(), direction = new Vector3(), up = new Vector3(0, 1, 0);
    let index = 0;
    const beam = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) => {
      a.set(ax, ay, az); b.set(bx, by, bz); direction.subVectors(b, a);
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.scale.set(w, direction.length(), w);
      dummy.quaternion.setFromUnitVectors(up, direction.normalize()); dummy.updateMatrix();
      beams.setMatrixAt(index++, dummy.matrix);
    };
    const corners = [[-6, -6], [6, -6], [6, 6], [-6, 6]];
    for (const [x, z] of corners) beam(C.towerX + x, C.groundY, z, C.towerX + x, C.towerTop, z, 1.05);

    const lampHaloMat = new SpriteMaterial({ map: warmGlow, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let y = C.groundY; y < C.towerTop; y += 10) {
      for (let face = 0; face < 4; face++) {
        const [x, z] = corners[face], [xx, zz] = corners[(face + 1) % 4];
        beam(C.towerX + x, y, z, C.towerX + xx, y + 10, zz, 0.55);
        beam(C.towerX + xx, y, zz, C.towerX + x, y + 10, z, 0.55);
        beam(C.towerX + x, y + 10, z, C.towerX + xx, y + 10, zz, 0.7);
      }
      const lamp = new Mesh(new BoxGeometry(2.1, 0.85, 0.45), sodium);
      lamp.position.set(C.towerX + 5.2, y + 8, 6.6);
      this.group.add(lamp);
      if ((y - C.groundY) % 20 === 0) {
        const halo = new Sprite(lampHaloMat);
        halo.position.set(C.towerX + 5.5, y + 8, 7.2);
        halo.scale.setScalar(13);
        this.group.add(halo);
      }
    }
    beams.count = index; beams.computeBoundingSphere(); this.group.add(beams);

    // Concrete pedestal base & heavy arm-carriage sled.
    const pedestal = new Mesh(new BoxGeometry(18, 6, 18), dark);
    pedestal.position.set(C.towerX, C.groundY + 3, 0);
    const carriage = new Mesh(new BoxGeometry(15.2, 12, 15.2), dark);
    carriage.position.set(C.towerX, -2, 0);
    const deck = new Mesh(new BoxGeometry(16.5, 2.2, 16.5), dark);
    deck.position.set(C.towerX, C.towerTop, 0);
    const railing = new Mesh(new BoxGeometry(16.8, 0.5, 16.8), steel);
    railing.position.set(C.towerX, C.towerTop + 2.4, 0);
    this.group.add(pedestal, carriage, deck, railing);

    // Chopstick catch arms with sodium guide rails & glowing tips.
    this.tipHaloMaterial = new SpriteMaterial({ map: warmGlow, color: 0xffc878, transparent: true, opacity: 0.78, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 2; i++) {
      const bar = new Mesh(new BoxGeometry(47, 2.3, 2.5), steel); bar.position.x = 23.5;
      const truss = new Mesh(new BoxGeometry(45, 0.9, 1.6), dark); truss.position.set(23, -1.35, 0);
      const stripe = new Mesh(new BoxGeometry(45, 0.42, 2.75), sodium); stripe.position.set(23.5, 1.0, 0);
      const tip = new Mesh(new SphereGeometry(0.95, 10, 8), this.tipsMaterial); tip.position.set(47, 1.35, 0);
      const tipHalo = new Sprite(this.tipHaloMaterial); tipHalo.position.set(47, 1.35, 0); tipHalo.scale.setScalar(11);
      this.arms[i].add(bar, truss, stripe, tip, tipHalo);
      this.group.add(this.arms[i]);
    }

    // Lightning arrestor mast + blinking red aviation beacon + wind flag.
    const mast = new Mesh(new CylinderGeometry(0.18, 0.48, 22, 8), steel);
    mast.position.set(C.towerX, C.towerTop + 12, 0);
    const beacon = new Mesh(new SphereGeometry(0.9, 8, 6), this.beaconMaterial);
    beacon.position.set(C.towerX, C.towerTop + 23.2, 0);
    this.beaconHalo = new Sprite(new SpriteMaterial({ map: redGlow, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.beaconHalo.position.copy(beacon.position);
    this.beaconHalo.scale.setScalar(16);
    this.flag.position.set(C.towerX + 3.2, C.towerTop + 14.5, 0);
    this.group.add(mast, beacon, this.beaconHalo, this.flag);

    // Subtle volumetric uplight beams from the pad toward the catch zone.
    const beamMat = new MeshBasicMaterial({
      color: 0xffc682, transparent: true, opacity: 0.045,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false,
    });
    const coneGeo = new ConeGeometry(28, 125, 16, 1, true);
    const leftLight = new Mesh(coneGeo, beamMat);
    leftLight.position.set(C.towerX + 18, C.groundY + 56, 14);
    leftLight.rotation.z = 0.24;
    const rightLight = new Mesh(coneGeo, beamMat);
    rightLight.position.set(22, C.groundY + 54, 14);
    rightLight.rotation.z = -0.26;
    this.group.add(leftLight, rightLight);
  }

  update(game: ArcadeGame, dt: number, time = game.time): void {
    const closed = game.arms.closed || game.arms.closing;
    const aligned = game.state === 'dropping' && !game.flare.active
      && Math.abs(game.booster.x - game.arms.x) <= game.conditions.catchOffset;
    this.closure += ((closed ? 1 : 0) - this.closure) * Math.min(1, dt * 28);
    for (let i = 0; i < 2; i++) {
      this.arms[i].position.set(C.towerX, -1, (i === 0 ? 1 : -1) * (7 - this.closure * 2));
      this.arms[i].scale.x = (47 + game.arms.x) / 47;
      this.arms[i].rotation.y = (i === 0 ? -1 : 1) * (1 - this.closure) * 0.045;
    }
    const tipColor = closed || aligned ? 0x7ef8c9 : 0xffbb64;
    this.tipsMaterial.color.setHex(tipColor);
    this.tipHaloMaterial.color.setHex(tipColor);
    this.tipHaloMaterial.opacity = closed ? 1 : aligned ? 0.88 : 0.65;

    // Slow aviation beacon pulse (~0.9 Hz).
    const pulse = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(time * 4.5), 3);
    this.beaconMaterial.color.setRGB(1 * pulse, 0.24 * pulse, 0.2 * pulse);
    this.beaconHalo.material.opacity = 0.2 + 0.85 * pulse;
    this.beaconHalo.scale.setScalar(11 + 8 * pulse);

    const wind = game.wind.base + game.wind.gust;
    this.flag.scale.x = Math.abs(wind) > 0.01 ? Math.sign(wind) * (0.7 + Math.abs(wind) * 0.2) : 0.32;
    this.flag.position.x = C.towerX + 3.2 * this.flag.scale.x;
    this.flag.rotation.x = Math.sin(time * 12) * Math.min(0.5, Math.abs(wind) * 0.3);
  }

  dispose(): void {
    for (const tex of this.textures) tex.dispose();
  }
}

/** 70 m stainless-steel booster with brushed ring-weld texture, glowing engine bells and RCS thruster puffs. */
export class BoosterMesh {
  readonly group = new Group();
  private readonly bellGlowMat = new MeshBasicMaterial({ color: 0x1a1e24, toneMapped: false });
  private readonly rcsLeft: Mesh;
  private readonly rcsRight: Mesh;
  private readonly rcsMat = new ShaderMaterial({
    transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float fade = smoothstep(1.0, 0.08, vUv.y) * smoothstep(0.0, 0.12, vUv.y); gl_FragColor = vec4(0.84, 0.95, 1.0, fade * 0.72); }',
  });
  private readonly textures: CanvasTexture[] = [];

  constructor() {
    const skin = createBoosterTexture();
    const pinGlow = createGlowTexture('#fff6d6', '#ffc06899', '#ff802000');
    this.textures.push(skin, pinGlow);

    const steel = new MeshStandardMaterial({ map: skin, color: 0xdbe5ee, metalness: 0.78, roughness: 0.27 });
    const trimSteel = new MeshStandardMaterial({ color: 0x9aaab8, metalness: 0.76, roughness: 0.3 });
    const dark = new MeshStandardMaterial({ color: 0x1f2e3c, metalness: 0.55, roughness: 0.58 });
    const sodium = new MeshBasicMaterial({ color: 0xffc670, toneMapped: false });

    const body = new Mesh(new CylinderGeometry(C.halfWidth, C.halfWidth, 67, 28), steel);
    body.position.y = -24.5;
    // Slightly tapered hot-stage interstage ring at nose.
    const cap = new Mesh(new CylinderGeometry(C.halfWidth * 0.96, C.halfWidth, 2.2, 24), dark);
    cap.position.y = 8.4;
    const skirt = new Mesh(new CylinderGeometry(4.58, 4.65, 3.6, 24), dark);
    skirt.position.y = -59.3;
    this.group.add(body, cap, skirt);

    // Circumferential weld seams for crisp silhouette specular highlights.
    const seams = new InstancedMesh(new TorusGeometry(4.53, 0.11, 5, 24), dark, 9);
    const dummy = new Object3D();
    for (let i = 0; i < 9; i++) {
      dummy.rotation.x = Math.PI / 2; dummy.position.y = 6 - i * 8; dummy.updateMatrix(); seams.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(seams);

    // Vertical chine / avionics raceway.
    const stripe = new Mesh(new BoxGeometry(1.15, 50, 0.28), dark);
    stripe.position.set(0, -21, 4.5);
    this.group.add(stripe);

    // Catch pins (with subtle glow halos so pin level is instantly readable) & waffle grid fins.
    const pinHaloMat = new SpriteMaterial({ map: pinGlow, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const sign of [-1, 1]) {
      const pin = new Mesh(new BoxGeometry(3.6, 0.75, 1.45), sodium);
      pin.position.set(sign * 5.4, 0.35, 0);
      const pinHalo = new Sprite(pinHaloMat);
      pinHalo.position.set(sign * 6.4, 0.35, 0.8);
      pinHalo.scale.setScalar(5.5);
      this.group.add(pin, pinHalo);

      const fin = new Group(); fin.position.set(sign * 5, 2, 0);
      for (let j = 0; j < 5; j++) {
        const rib = new Mesh(new BoxGeometry(4, 0.3, 0.45), dark); rib.position.set(sign * 1.5, j * 0.65, 0); fin.add(rib);
      }
      const edge = new Mesh(new BoxGeometry(0.42, 3.1, 0.55), trimSteel); edge.position.set(sign * 3.3, 1.3, 0); fin.add(edge);
      this.group.add(fin);
    }

    // Engine cluster with glowing inner chambers.
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 2.4;
      const nozzle = new Mesh(new CylinderGeometry(0.85, 1.28, 2.2, 12, 1, true), dark);
      nozzle.position.set(x, -61, 0);
      const innerBell = new Mesh(new CylinderGeometry(0.65, 1.05, 1.6, 10), this.bellGlowMat);
      innerBell.position.set(x, -61.1, 0);
      this.group.add(nozzle, innerBell);
    }

    // Cold-gas RCS thruster plumes near the upper nose: narrow at hull port (y=0), fanning outward (y=10).
    const rcsGeo = new CylinderGeometry(1.5, 0.25, 10, 10, 1, true);
    rcsGeo.translate(0, 5, 0);
    this.rcsLeft = new Mesh(rcsGeo, this.rcsMat);
    this.rcsLeft.position.set(-4.6, 5.2, 0);
    this.rcsLeft.rotation.z = Math.PI / 2;
    this.rcsRight = new Mesh(rcsGeo, this.rcsMat);
    this.rcsRight.position.set(4.6, 5.2, 0);
    this.rcsRight.rotation.z = -Math.PI / 2;
    this.rcsLeft.visible = this.rcsRight.visible = false;
    this.group.add(this.rcsLeft, this.rcsRight);
  }

  update(game: ArcadeGame, preview = false): void {
    const b = game.booster;
    this.group.position.set(b.x, b.y, 0);
    this.group.rotation.z = -b.tilt;
    this.group.visible = game.state !== 'exploding' && game.state !== 'gameOver';

    // Incandescent bell glow during burn or valve spool-up.
    if (b.burning || preview) this.bellGlowMat.color.setHex(0xffdf9e);
    else if (b.spooling) this.bellGlowMat.color.setHex(0xff8c42);
    else this.bellGlowMat.color.setHex(0x181e26);

    // Fire opposite-side RCS cold-gas puff when actively pushing sideways.
    const active = game.state === 'dropping';
    const steer = b.tilt / C.maxTilt;
    const pulse = 0.78 + Math.sin(game.time * 64) * 0.22;
    this.rcsLeft.visible = active && steer > 0.18;
    this.rcsRight.visible = active && steer < -0.18;
    if (this.rcsLeft.visible) {
      const s = Math.min(1.2, Math.abs(steer)) * pulse;
      this.rcsLeft.scale.set(0.75 + s * 0.3, 0.7 + s * 0.9, 0.75 + s * 0.3);
    }
    if (this.rcsRight.visible) {
      const s = Math.min(1.2, Math.abs(steer)) * pulse;
      this.rcsRight.scale.set(0.75 + s * 0.3, 0.7 + s * 0.9, 0.75 + s * 0.3);
    }
  }

  dispose(): void {
    for (const tex of this.textures) tex.dispose();
  }
}
