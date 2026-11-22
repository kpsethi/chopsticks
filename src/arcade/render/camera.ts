import { PerspectiveCamera, Vector3 } from 'three';

/** Fixed for each drop: no follow, zoom or camera modes during flight. */
export class ArcadeCamera {
  readonly camera = new PerspectiveCamera(35, 1, 1, 3600);
  private readonly origin = new Vector3();
  private readonly target = new Vector3();
  private readonly projected = new Vector3();
  width = 1; height = 1;
  frame(width: number, height: number, spawnHeight: number): void {
    this.width = width; this.height = height;
    const aspect = width / height;
    const bottom = -110, top = spawnHeight + 38;
    const span = Math.max((top - bottom) * 1.12, 195 / aspect);
    const distance = span / (2 * Math.tan(35 * Math.PI / 360));
    this.target.set(aspect > 1.2 ? -35 : 0, (top + bottom) / 2, 0);
    this.origin.set(this.target.x + distance * 0.06, this.target.y + distance * 0.05, distance);
    this.camera.aspect = aspect; this.camera.position.copy(this.origin); this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }
  shake(amount: number, time: number): void {
    this.camera.position.copy(this.origin);
    this.camera.position.x += Math.sin(time * 113) * amount;
    this.camera.position.y += Math.cos(time * 91) * amount;
    this.camera.updateMatrixWorld();
  }
  /** Reuses one vector; consume coordinates before the next projection. */
  project(x: number, y: number, z = 0): Vector3 {
    this.projected.set(x, y, z).project(this.camera);
    this.projected.x = (this.projected.x + 1) * this.width / 2;
    this.projected.y = (1 - this.projected.y) * this.height / 2;
    return this.projected;
  }
}
