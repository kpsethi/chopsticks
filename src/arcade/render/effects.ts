import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry,
  DoubleSide, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial, PointLight, Points, PointsMaterial,
  RingGeometry, ShaderMaterial, Sprite, SpriteMaterial } from 'three';
import { ARCADE as C } from '../constants';
import { createGlowTexture, createPuffTexture } from './textures';

interface Puff {
  sprite: Sprite;
  material: SpriteMaterial;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  alpha: number;
}

/** Preallocated methalox mach-diamond plume, steam trail, catch celebration and explosion VFX. */
export class Effects {
  readonly plume = new Group();
  readonly explosion = new Group();
  readonly world = new Group();
  private readonly glow: Sprite;
  private readonly nozzleHalo: Sprite;
  private readonly shockwave: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly positions = new Float32Array(140 * 3);
  private readonly velocities = new Float32Array(140 * 3);
  private readonly geometry = new BufferGeometry();
  private readonly sparks = new PointsMaterial({
    color: 0xffc878, size: 2.8, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  private readonly catchPositions = new Float32Array(48 * 3);
  private readonly catchVelocities = new Float32Array(48 * 3);
  private readonly catchGeometry = new BufferGeometry();
  private readonly catchSparks = new PointsMaterial({
    color: 0x8effd2, size: 2.6, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  private readonly catchGroup = new Group();
  private readonly engineLight = new PointLight(0xffb464, 0, 180, 1.1);
  private readonly outerMat: ShaderMaterial;
  private readonly innerMat: ShaderMaterial;
  private readonly outer: Mesh;
  private readonly inner: Mesh;
  private readonly puffs: Puff[] = [];
  private readonly textures: CanvasTexture[] = [];
  private puffCursor = 0;
  private puffTimer = 0;
  private age = 2;
  private catchAge = 2;
  private catchPerfect = false;

  constructor(booster: Group) {
    const fireballTex = createGlowTexture('#fffbe6', '#ff9b42cc', '#ff440000');
    const nozzleTex = createGlowTexture('#ffffff', '#88c4ffaa', '#ff903000');
    const puffTex = createPuffTexture();
    this.textures.push(fireballTex, nozzleTex, puffTex);

    // Methalox plume shader: soft feathered edges + animated Mach shock diamonds.
    const plumeVertex = `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `;
    const outerFragment = `
      uniform float uTime;
      uniform float uPower;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        // vUv.y = 1 at nozzle throat, 0 at tail tip.
        float tipFade = smoothstep(0.0, 0.58, vUv.y);
        float topFade = smoothstep(1.0, 0.9, vUv.y);
        float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.35);
        float mach = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(vUv.y * 28.0 + uTime * 38.0), 3.0);
        float flicker = 0.92 + 0.08 * sin(uTime * 67.0 + vUv.y * 12.0);
        vec3 blue = vec3(0.42, 0.68, 1.0);
        vec3 amber = vec3(1.0, 0.68, 0.34);
        vec3 hot = vec3(1.0, 0.95, 0.84);
        vec3 col = mix(amber, blue, smoothstep(0.08, 0.72, vUv.y));
        col = mix(col, hot, smoothstep(0.75, 0.98, vUv.y) * mach);
        float alpha = tipFade * topFade * edge * (0.58 + 0.28 * mach) * flicker * uPower;
        gl_FragColor = vec4(col, alpha);
      }
    `;
    const innerFragment = `
      uniform float uTime;
      uniform float uPower;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        float tipFade = smoothstep(0.05, 0.7, vUv.y);
        float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.85);
        float diamond = pow(0.5 + 0.5 * sin(vUv.y * 24.0 + uTime * 42.0), 4.0);
        vec3 col = mix(vec3(1.0, 0.86, 0.56), vec3(1.0, 0.99, 0.94), smoothstep(0.3, 0.95, vUv.y) + diamond * 0.4);
        float alpha = tipFade * edge * (0.78 + 0.22 * diamond) * uPower;
        gl_FragColor = vec4(col, alpha);
      }
    `;

    // Expanding exhaust column: matches Raptor cluster width at throat (0.42), flares smoothly downward.
    const cone = new CylinderGeometry(0.42, 1, 1, 20, 8, true);
    cone.translate(0, -0.5, 0);
    this.outerMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
      vertexShader: plumeVertex,
      fragmentShader: outerFragment,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    this.innerMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
      vertexShader: plumeVertex,
      fragmentShader: innerFragment,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });

    this.outer = new Mesh(cone, this.outerMat);
    this.inner = new Mesh(cone, this.innerMat);
    this.nozzleHalo = new Sprite(new SpriteMaterial({
      map: nozzleTex, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.nozzleHalo.position.set(0, -3, 0);
    this.nozzleHalo.scale.set(22, 22, 1);

    this.plume.add(this.outer, this.inner, this.nozzleHalo);
    this.plume.position.y = -61.5;
    this.engineLight.position.y = -66;
    booster.add(this.plume, this.engineLight);

    // Explosion fireball, shockwave ring & sparks.
    this.glow = new Sprite(new SpriteMaterial({
      map: fireballTex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.shockwave = new Mesh(
      new RingGeometry(0.82, 1, 32),
      new MeshBasicMaterial({ color: 0xffd79a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    );
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    const points = new Points(this.geometry, this.sparks);
    points.frustumCulled = false;
    this.explosion.add(points, this.glow, this.shockwave);
    this.explosion.visible = false;
    for (let i = 0; i < this.velocities.length; i += 3) {
      const angle = i * 2.39996, speed = 14 + (i * 19 % 52);
      this.velocities[i] = Math.cos(angle) * speed;
      this.velocities[i + 1] = Math.sin(angle) * speed + 6;
      this.velocities[i + 2] = Math.sin(i * 3.7) * 14;
    }

    // Catch celebration sparks.
    this.catchGeometry.setAttribute('position', new BufferAttribute(this.catchPositions, 3).setUsage(DynamicDrawUsage));
    const catchPoints = new Points(this.catchGeometry, this.catchSparks);
    catchPoints.frustumCulled = false;
    this.catchGroup.add(catchPoints);
    this.catchGroup.visible = false;
    this.world.add(this.catchGroup);
    for (let i = 0; i < this.catchVelocities.length; i += 3) {
      const spread = ((i / 3) / 48) * Math.PI * 2;
      const speed = 10 + (i * 13 % 26);
      this.catchVelocities[i] = Math.cos(spread) * speed * 1.3;
      this.catchVelocities[i + 1] = Math.abs(Math.sin(spread)) * speed * 0.9 + 4;
      this.catchVelocities[i + 2] = Math.sin(i * 2.1) * 8;
    }

    // Preallocated world-space exhaust steam / smoke puff pool.
    for (let i = 0; i < 36; i++) {
      const material = new SpriteMaterial({
        map: puffTex, color: new Color(0xcbd8e6), transparent: true, opacity: 0, depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.visible = false;
      this.world.add(sprite);
      this.puffs.push({ sprite, material, vx: 0, vy: 0, age: 10, life: 1, size0: 6, size1: 24, alpha: 0.3 });
    }
  }

  private spawnPuff(x: number, y: number, z: number, vx: number, vy: number, life: number, size0: number, size1: number, colorHex: number, alpha: number): void {
    const p = this.puffs[this.puffCursor];
    this.puffCursor = (this.puffCursor + 1) % this.puffs.length;
    p.sprite.position.set(x, y, z);
    p.sprite.visible = true;
    p.sprite.scale.setScalar(size0);
    p.material.color.setHex(colorHex);
    p.material.opacity = alpha;
    p.vx = vx; p.vy = vy; p.age = 0; p.life = life; p.size0 = size0; p.size1 = size1; p.alpha = alpha;
  }

  burst(x: number, y: number): void {
    this.age = 0;
    this.explosion.position.set(x, y - 25, 0);
    // Rising lit smoke cloud around explosion site.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawnPuff(
        x + Math.cos(a) * 8, y - 24 + Math.sin(a) * 8, -2 + (i % 3) * 2,
        Math.cos(a) * (10 + (i % 4) * 5), Math.sin(a) * 9 + 12,
        1.4 + (i % 3) * 0.35, 14, 52, i % 2 === 0 ? 0xffaa62 : 0x566475, 0.55,
      );
    }
  }

  celebrate(x: number, perfect: boolean): void {
    this.catchAge = 0;
    this.catchPerfect = perfect;
    this.catchGroup.position.set(x, 0, 2);
    this.catchSparks.color.setHex(perfect ? 0xffe28a : 0x83efc6);
    // Celebratory cryo vent / steam puffs from the chopstick pins.
    const count = perfect ? 8 : 5;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.spawnPuff(
        x + side * (5 + (i % 3) * 2), -1, 2,
        side * (12 + i * 2.5), 4 + (i % 3) * 3,
        0.95, 7, 28, perfect ? 0xffe9b5 : 0xd0e8f5, 0.42,
      );
    }
  }

  reset(): void {
    this.age = 2;
    this.catchAge = 2;
    this.explosion.visible = false;
    this.catchGroup.visible = false;
    for (const p of this.puffs) { p.age = p.life + 1; p.sprite.visible = false; }
  }

  get shake(): number { return this.age < 0.7 ? Math.exp(-this.age * 6.5) * 3.0 : 0; }

  update(dt: number, time: number, burning: boolean, spooling = false, boosterX = 0, boosterY = 140, windX = 0): void {
    this.plume.visible = burning || spooling;
    this.outerMat.uniforms.uTime.value = time;
    this.innerMat.uniforms.uTime.value = time;

    const pulse = 1 + Math.sin(time * 71) * 0.065;
    if (burning) {
      this.engineLight.intensity = 120 * pulse;
      this.outerMat.uniforms.uPower.value = 1;
      this.innerMat.uniforms.uPower.value = 1;
      this.outer.scale.set(6.2, 46 * pulse, 6.2);
      this.inner.scale.set(3.2, 34 * pulse, 3.2);
      this.nozzleHalo.visible = true;
      this.nozzleHalo.scale.setScalar(22 * pulse);
      this.nozzleHalo.material.opacity = 0.78;

      // Emit exhaust steam / ground-wash puffs along the flight path.
      this.puffTimer += dt;
      if (this.puffTimer >= 0.045) {
        this.puffTimer = 0;
        const nozzleY = boosterY - 62;
        const agl = nozzleY - C.groundY;
        const nearPad = agl < 65;
        const spread = (Math.sin(time * 53.7) * 0.5);
        if (nearPad) {
          // Ground-effect exhaust wash billowing horizontally across the pad.
          const side = Math.sin(time * 31.3) >= 0 ? 1 : -1;
          this.spawnPuff(
            boosterX + side * 6, C.groundY + 5, 3,
            side * (26 + Math.abs(spread) * 18) + windX * 4, 4 + Math.abs(spread) * 5,
            0.95, 10, 40, 0xffd2a1, 0.34,
          );
        } else {
          this.spawnPuff(
            boosterX + spread * 4, nozzleY - 22, -2,
            windX * 5 + spread * 8, -14,
            0.85, 7, 26, 0xbfd0e0, 0.22,
          );
        }
      }
    } else if (spooling) {
      const flicker = 0.65 + Math.sin(time * 97) * 0.35;
      this.engineLight.intensity = 28 * flicker;
      this.outerMat.uniforms.uPower.value = 0.55 * flicker;
      this.innerMat.uniforms.uPower.value = 0.5 * flicker;
      this.outer.scale.set(2.8, 10 * flicker, 2.8);
      this.inner.scale.set(1.6, 6 * flicker, 1.6);
      this.nozzleHalo.visible = true;
      this.nozzleHalo.scale.setScalar(10 * flicker);
      this.nozzleHalo.material.opacity = 0.45 * flicker;
    } else {
      this.engineLight.intensity = 0;
      this.nozzleHalo.visible = false;
    }

    // Update world-space puffs.
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (!p.sprite.visible) continue;
      p.age += dt;
      if (p.age >= p.life) { p.sprite.visible = false; continue; }
      const t = p.age / p.life;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.vx *= Math.exp(-1.4 * dt);
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * t);
      p.material.opacity = p.alpha * (1 - t) * (1 - t);
    }

    // Update explosion.
    this.age += dt;
    this.explosion.visible = this.age < 1.6;
    if (this.explosion.visible) {
      for (let i = 0; i < this.positions.length; i += 3) {
        this.positions[i] = this.velocities[i] * this.age;
        this.positions[i + 1] = this.velocities[i + 1] * this.age - 7 * this.age * this.age;
        this.positions[i + 2] = this.velocities[i + 2] * this.age;
      }
      this.geometry.attributes.position.needsUpdate = true;
      this.sparks.opacity = Math.max(0, 1 - this.age / 1.6);
      this.glow.scale.setScalar(34 + this.age * 96);
      this.glow.material.opacity = Math.max(0, 1 - this.age / 0.72);
      const ringT = Math.min(1, this.age / 0.45);
      this.shockwave.visible = this.age < 0.45;
      this.shockwave.scale.setScalar(8 + ringT * 78);
      this.shockwave.material.opacity = (1 - ringT) * 0.65;
    }

    // Update catch celebration sparks.
    this.catchAge += dt;
    this.catchGroup.visible = this.catchAge < 1.05;
    if (this.catchGroup.visible) {
      const scale = this.catchPerfect ? 1.45 : 1;
      for (let i = 0; i < this.catchPositions.length; i += 3) {
        this.catchPositions[i] = this.catchVelocities[i] * this.catchAge * scale;
        this.catchPositions[i + 1] = this.catchVelocities[i + 1] * this.catchAge * scale - 11 * this.catchAge * this.catchAge;
        this.catchPositions[i + 2] = this.catchVelocities[i + 2] * this.catchAge;
      }
      this.catchGeometry.attributes.position.needsUpdate = true;
      this.catchSparks.opacity = Math.max(0, 1 - this.catchAge / 1.05);
    }
  }

  dispose(): void {
    for (const tex of this.textures) tex.dispose();
  }
}
