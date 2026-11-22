import { BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from 'three';
import type { ArcadeGame } from '../game';

export class Hazards {
  readonly group = new Group();
  private readonly slots: { root: Group; drone: Group; bird: Group; balloon: Group; light: Mesh; wings: Mesh[] }[] = [];
  constructor() {
    const dark = new MeshStandardMaterial({ color: 0x344859, metalness: 0.5, roughness: 0.55 });
    const red = new MeshBasicMaterial({ color: 0xff554c, toneMapped: false });
    const white = new MeshBasicMaterial({ color: 0xe0ecf5 });
    const pink = new MeshStandardMaterial({ color: 0xe6a5b5, roughness: 0.75 });
    for (let i = 0; i < 6; i++) {
      const root = new Group(), drone = new Group(), bird = new Group(), balloon = new Group();
      const body = new Mesh(new BoxGeometry(6, 2, 3), dark); drone.add(body);
      for (const x of [-4, 4]) for (const z of [-2, 2]) {
        const rotor = new Mesh(new BoxGeometry(3.4, 0.3, 0.6), dark); rotor.position.set(x, 0.8, z); drone.add(rotor);
      }
      const light = new Mesh(new SphereGeometry(0.85, 6, 4), red); light.position.set(0, 0, 2); drone.add(light);
      const wings: Mesh[] = [];
      for (const sign of [-1, 1]) {
        const wing = new Mesh(new BoxGeometry(4.4, 0.55, 1.5), white);
        wing.geometry.translate(sign * 2, 0, 0); wings.push(wing); bird.add(wing);
      }
      const sphere = new Mesh(new SphereGeometry(1, 12, 8), pink); sphere.scale.set(9, 6, 5); sphere.position.y = 1; balloon.add(sphere);
      const basket = new Mesh(new BoxGeometry(3, 2, 2), dark); basket.position.y = -6; balloon.add(basket);
      const neck = new Mesh(new ConeGeometry(2, 4, 6), pink); neck.rotation.z = Math.PI; neck.position.y = -4; balloon.add(neck);
      root.add(drone, bird, balloon); this.group.add(root);
      this.slots.push({ root, drone, bird, balloon, light, wings });
    }
  }
  update(game: ArcadeGame): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], h = game.hazards[i];
      s.root.visible = !!h && Math.abs(h.x) < 100 && !(game.fogBand && h.y >= game.fogBand.bottom && h.y <= game.fogBand.top);
      if (!h || !s.root.visible) continue;
      s.root.position.set(h.x, h.y, 0);
      s.drone.visible = h.kind === 'drone'; s.bird.visible = h.kind === 'bird'; s.balloon.visible = h.kind === 'balloon';
      s.light.scale.setScalar(Math.sin(game.time * 8 + i) > 0 ? 1 : 0.4);
      s.wings[0].rotation.z = -0.4 + Math.sin(game.time * 10 + i) * 0.45;
      s.wings[1].rotation.z = 0.4 - Math.sin(game.time * 10 + i) * 0.45;
      s.balloon.rotation.z = Math.sin(game.time * 1.5 + i) * 0.06;
    }
  }
}
