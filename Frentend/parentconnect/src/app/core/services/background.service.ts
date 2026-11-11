import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class BackgroundService {
  readonly photos: string[] = ['/ph1.jpg', '/ph2.jpg', '/ph3.jpg'];
  readonly activePhotoIndex = signal<number>(0);
  private timer: any = null;

  constructor() {
    this.startAutoRotation();
  }

  startAutoRotation(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => {
      this.activePhotoIndex.update(i => (i + 1) % this.photos.length);
    }, 7000);
  }

  setPhotoIndex(index: number): void {
    if (index >= 0 && index < this.photos.length) {
      this.activePhotoIndex.set(index);
      this.startAutoRotation();
    }
  }
}
