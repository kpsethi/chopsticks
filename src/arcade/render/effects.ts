import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, ConeGeometry,
  DoubleSide, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial, PointLight, Points, PointsMaterial, Sprite, SpriteMaterial } from 'three';

/** Preallocated plume and explosion pool, adapted from the original renderer. */
export class Effects {
  readonly plume = new Group();
  readonly explosion = new Group();
  private readonly glow: Sprite;
  private readonly positions = new Float32Array(120 * 3);
  private readonly velocities = new Float32Array(120 * 3);
  private readonly geometry = new BufferGeometry();
  private readonly sparks = new PointsMaterial({ color: 0xffc476, size: 2.4, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  private readonly engineLight = new PointLight(0xffb66a, 0, 140, 1);
  private age = 2;
  private readonly outer: Mesh;
  private readonly inner: Mesh;
  constructor(booster: Group) {
    const cone = new ConeGeometry(1, 1, 12, 1, true); cone.translate(0, -0.5, 0);
    this.outer = new Mesh(cone, new MeshBasicMaterial({ color: 0x6caeff, transparent: true,
      opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
    this.inner = new Mesh(cone, new MeshBasicMaterial({ color: 0xfff0c6, transparent: true,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
    this.plume.add(this.outer, this.inner); this.plume.position.y = -62;
    this.engineLight.position.y = -65; booster.add(this.plume, this.engineLight);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!, gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#fff9dc'); gradient.addColorStop(0.2, '#ffd180');
    gradient.addColorStop(0.5, '#ff7b2599'); gradient.addColorStop(1, '#ff5b0000');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    this.glow = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    const points = new Points(this.geometry, this.sparks); points.frustumCulled = false;
    this.explosion.add(points, this.glow); this.explosion.visible = false;
    for (let i = 0; i < this.velocities.length; i += 3) {
      const angle = i * 2.39996, speed = 12 + (i * 17 % 41);
      this.velocities[i] = Math.cos(angle) * speed; this.velocities[i + 1] = Math.sin(angle) * speed;
      this.velocities[i + 2] = Math.sin(i * 3.7) * 12;
    }
  }
  burst(x: number, y: number): void { this.age = 0; this.explosion.position.set(x, y - 25, 0); }
  reset(): void { this.age = 2; this.explosion.visible = false; }
  get shake(): number { return this.age < 0.65 ? Math.exp(-this.age * 7) * 2.6 : 0; }
  update(dt: number, time: number, burning: boolean): void {
    this.plume.visible = burning; this.engineLight.intensity = burning ? 90 : 0;
    const pulse = 1 + Math.sin(time * 71) * 0.07;
    this.outer.scale.set(5.3, 40 * pulse, 5.3); this.inner.scale.set(2.7, 30 * pulse, 2.7);
    this.age += dt;
    this.explosion.visible = this.age < 1.5;
    if (!this.explosion.visible) return;
    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i] = this.velocities[i] * this.age;
      this.positions[i + 1] = this.velocities[i + 1] * this.age - 6 * this.age * this.age;
      this.positions[i + 2] = this.velocities[i + 2] * this.age;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.sparks.opacity = Math.max(0, 1 - this.age / 1.5);
    this.glow.scale.setScalar(30 + this.age * 85);
    this.glow.material.opacity = Math.max(0, 1 - this.age / 0.65);
  }
}
