import { ArcadeApp } from './arcade/app';
import './arcade/ui/arcade.css';

export const app = new ArcadeApp();
if (import.meta.env.DEV) (window as unknown as { app: ArcadeApp }).app = app;
