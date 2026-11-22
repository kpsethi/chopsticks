import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { ARCADE as C } from '../constants';
import type { ArcadeGame } from '../game';

const steel = new MeshStandardMaterial({ color: 0x8a9ba9, metalness: 0.65, roughness: 0.36 });
const dark = new MeshStandardMaterial({ color: 0x233544, metalness: 0.5, roughness: 0.6 });
const sodium = new MeshBasicMaterial({ color: 0xffbb64, toneMapped: false });

/** Simplified port of the old lattice: one instanced draw for all structural beams. */
export class TowerMesh {
  readonly group = new Group();
  private readonly arms = [new Group(), new Group()];
  private readonly flag = new Mesh(new BoxGeometry(6, 2.8, 0.12), sodium);
  private readonly tips = new MeshBasicMaterial({ color: 0xffbb64, toneMapped: false });
  private closure = 0;
  constructor() {
    const beams = new InstancedMesh(new BoxGeometry(1, 1, 1), steel, 160);
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
    for (const [x, z] of corners) beam(C.towerX + x, C.groundY, z, C.towerX + x, C.towerTop, z, 1);
    for (let y = C.groundY; y < C.towerTop; y += 10) {
      for (let face = 0; face < 4; face++) {
        const [x, z] = corners[face], [xx, zz] = corners[(face + 1) % 4];
        beam(C.towerX + x, y, z, C.towerX + xx, y + 10, zz, 0.55);
        beam(C.towerX + xx, y, zz, C.towerX + x, y + 10, z, 0.55);
        beam(C.towerX + x, y + 10, z, C.towerX + xx, y + 10, zz, 0.7);
      }
      const lamp = new Mesh(new BoxGeometry(2, 0.8, 0.4), sodium);
      lamp.position.set(C.towerX + 5, y + 8, 6.6); this.group.add(lamp);
    }
    beams.count = index; beams.computeBoundingSphere(); this.group.add(beams);
    const deck = new Mesh(new BoxGeometry(16, 2, 16), dark);
    deck.position.set(C.towerX, C.towerTop, 0); this.group.add(deck);
    for (let i = 0; i < 2; i++) {
      const bar = new Mesh(new BoxGeometry(47, 2, 2.4), steel); bar.position.x = 23.5;
      const stripe = new Mesh(new BoxGeometry(45, 0.35, 2.6), sodium); stripe.position.set(23.5, 0.9, 0);
      const tip = new Mesh(new SphereGeometry(0.8, 8, 6), this.tips); tip.position.set(47, 1.3, 0);
      this.arms[i].add(bar, stripe, tip); this.group.add(this.arms[i]);
    }
    const pole = new Mesh(new CylinderGeometry(0.22, 0.22, 14, 6), steel);
    pole.position.set(C.towerX, 18, 0); this.flag.position.set(C.towerX + 3, 23, 0);
    this.group.add(pole, this.flag);
  }
  update(game: ArcadeGame, dt: number): void {
    const closed = game.arms.closed || game.arms.closing;
    this.closure += ((closed ? 1 : 0) - this.closure) * Math.min(1, dt * 28);
    for (let i = 0; i < 2; i++) {
      this.arms[i].position.set(C.towerX, -1, (i === 0 ? 1 : -1) * (7 - this.closure * 2));
      this.arms[i].scale.x = (47 + game.arms.x) / 47;
      this.arms[i].rotation.y = (i === 0 ? -1 : 1) * (1 - this.closure) * 0.045;
    }
    this.tips.color.setHex(closed ? 0x75f4c5 : 0xffbb64);
    const wind = game.wind.base + game.wind.gust;
    this.flag.scale.x = Math.abs(wind) > 0.01 ? Math.sign(wind) * (0.7 + Math.abs(wind) * 0.2) : 0.3;
    this.flag.position.x = C.towerX + 3 * this.flag.scale.x;
    this.flag.rotation.x = Math.sin(game.time * 12) * Math.min(0.5, Math.abs(wind) * 0.3);
  }
}

/** Pins are the local origin, matching the arcade collision coordinates. */
export class BoosterMesh {
  readonly group = new Group();
  constructor() {
    const body = new Mesh(new CylinderGeometry(C.halfWidth, C.halfWidth, 67, 24), steel);
    body.position.y = -24.5;
    const skirt = new Mesh(new CylinderGeometry(4.5, 4.5, 3, 24), dark); skirt.position.y = -59.5;
    this.group.add(body, skirt);
    const seams = new InstancedMesh(new TorusGeometry(4.53, 0.12, 4, 24), dark, 9);
    const dummy = new Object3D();
    for (let i = 0; i < 9; i++) {
      dummy.rotation.x = Math.PI / 2; dummy.position.y = 6 - i * 8; dummy.updateMatrix(); seams.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(seams);
    const stripe = new Mesh(new BoxGeometry(1.2, 48, 0.2), dark); stripe.position.set(0, -20, 4.5); this.group.add(stripe);
    for (const sign of [-1, 1]) {
      const pin = new Mesh(new BoxGeometry(3.5, 0.7, 1.4), sodium); pin.position.set(sign * 5.4, 0.35, 0); this.group.add(pin);
      const fin = new Group(); fin.position.set(sign * 5, 2, 0);
      for (let j = 0; j < 5; j++) {
        const rib = new Mesh(new BoxGeometry(4, 0.3, 0.4), dark); rib.position.set(sign * 1.5, j * 0.65, 0); fin.add(rib);
      }
      const edge = new Mesh(new BoxGeometry(0.4, 3, 0.5), steel); edge.position.set(sign * 3.3, 1.3, 0); fin.add(edge);
      this.group.add(fin);
    }
    for (let i = 0; i < 3; i++) {
      const nozzle = new Mesh(new CylinderGeometry(0.8, 1.2, 2, 10, 1, true), dark);
      nozzle.position.set((i - 1) * 2.4, -61, 0); this.group.add(nozzle);
    }
  }
  update(game: ArcadeGame): void {
    this.group.position.set(game.booster.x, game.booster.y, 0);
    this.group.rotation.z = -game.booster.tilt;
    this.group.visible = game.state !== 'exploding' && game.state !== 'gameOver';
  }
}
