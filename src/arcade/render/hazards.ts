import { AdditiveBlending, BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, SphereGeometry, Sprite, SpriteMaterial } from 'three';
import type { ArcadeGame } from '../game';
import { createBalloonTexture, createGlowTexture } from './textures';

export class Hazards {
  readonly group = new Group();
  private readonly slots: {
    root: Group; drone: Group; bird: Group; balloon: Group;
    light: Mesh; lightHalo: Sprite; burnerHalo: Sprite; wings: Mesh[];
  }[] = [];
  private readonly textures: CanvasTexture[] = [];

  constructor() {
    const dark = new MeshStandardMaterial({ color: 0x2d4152, metalness: 0.6, roughness: 0.45 });
    const rotorMat = new MeshBasicMaterial({ color: 0x9bb7d0, transparent: true, opacity: 0.35 });
    const red = new MeshBasicMaterial({ color: 0xff5248, toneMapped: false });
    const white = new MeshStandardMaterial({ color: 0xeaf2f8, roughness: 0.65 });
    const basketMat = new MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.9 });

    const balloonTex = createBalloonTexture();
    const redGlow = createGlowTexture('#ffd0cc', '#ff453aaa', '#ff1a1000');
    const flameGlow = createGlowTexture('#fff5d4', '#ff9d42aa', '#ff580000');
    this.textures.push(balloonTex, redGlow, flameGlow);

    const balloonMat = new MeshStandardMaterial({ map: balloonTex, roughness: 0.65, metalness: 0.05 });
    const redHaloMat = new SpriteMaterial({ map: redGlow, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const flameHaloMat = new SpriteMaterial({ map: flameGlow, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

    for (let i = 0; i < 6; i++) {
      const root = new Group(), drone = new Group(), bird = new Group(), balloon = new Group();

      // Drone: sleek body, four arms, translucent rotor blur discs, blinking red strobe + glow halo.
      const body = new Mesh(new BoxGeometry(6.2, 1.8, 3.2), dark);
      drone.add(body);
      for (const x of [-4.2, 4.2]) for (const z of [-2.1, 2.1]) {
        const arm = new Mesh(new BoxGeometry(2.6, 0.35, 0.45), dark);
        arm.position.set(x * 0.65, 0.3, z * 0.65);
        const rotor = new Mesh(new CylinderGeometry(1.9, 1.9, 0.14, 12), rotorMat);
        rotor.position.set(x, 0.95, z);
        drone.add(arm, rotor);
      }
      const light = new Mesh(new SphereGeometry(0.85, 8, 6), red);
      light.position.set(0, 0, 2);
      const lightHalo = new Sprite(redHaloMat.clone());
      lightHalo.position.set(0, 0, 2.4);
      lightHalo.scale.setScalar(8.5);
      drone.add(light, lightHalo);

      // Bird: sleek fuselage + swept articulated wings.
      const torso = new Mesh(new ConeGeometry(0.7, 3.4, 6), white);
      torso.rotation.z = -Math.PI / 2;
      bird.add(torso);
      const wings: Mesh[] = [];
      for (const sign of [-1, 1]) {
        const wing = new Mesh(new BoxGeometry(4.8, 0.48, 1.6), white);
        wing.geometry.translate(sign * 2.1, 0, 0);
        wings.push(wing);
        bird.add(wing);
      }

      // Hot-air balloon: striped envelope, throat, warm flickering burner glow, wicker basket.
      const sphere = new Mesh(new SphereGeometry(1, 18, 12), balloonMat);
      sphere.scale.set(9.2, 6.6, 6.2);
      sphere.position.y = 1.4;
      const neck = new Mesh(new ConeGeometry(2.4, 4.2, 10), balloonMat);
      neck.rotation.z = Math.PI;
      neck.position.y = -3.8;
      const burnerHalo = new Sprite(flameHaloMat.clone());
      burnerHalo.position.set(0, -4.6, 1.2);
      burnerHalo.scale.setScalar(8.5);
      const basket = new Mesh(new BoxGeometry(3.2, 2.2, 2.2), basketMat);
      basket.position.y = -6.6;
      balloon.add(sphere, neck, burnerHalo, basket);

      root.add(drone, bird, balloon);
      this.group.add(root);
      this.slots.push({ root, drone, bird, balloon, light, lightHalo, burnerHalo, wings });
    }
  }

  update(game: ArcadeGame): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], h = game.hazards[i];
      s.root.visible = !!h && Math.abs(h.x) < 100 && !(game.fogBand && h.y >= game.fogBand.bottom && h.y <= game.fogBand.top);
      if (!h || !s.root.visible) continue;
      s.root.position.set(h.x, h.y, 0);
      s.drone.visible = h.kind === 'drone';
      s.bird.visible = h.kind === 'bird';
      s.balloon.visible = h.kind === 'balloon';

      const blink = Math.sin(game.time * 8 + i) > 0;
      s.light.scale.setScalar(blink ? 1.05 : 0.42);
      s.lightHalo.material.opacity = blink ? 0.92 : 0.25;
      s.lightHalo.scale.setScalar(blink ? 9.5 : 4.5);

      const flap = Math.sin(game.time * 10 + i * 1.3) * 0.48;
      s.wings[0].rotation.z = -0.35 + flap;
      s.wings[1].rotation.z = 0.35 - flap;

      s.balloon.rotation.z = Math.sin(game.time * 1.4 + i) * 0.065;
      const burner = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(game.time * 4.2 + i * 2.1), 2);
      s.burnerHalo.material.opacity = 0.35 + 0.6 * burner;
      s.burnerHalo.scale.setScalar(6.5 + 4.5 * burner);
    }
  }

  dispose(): void {
    for (const tex of this.textures) tex.dispose();
  }
}
