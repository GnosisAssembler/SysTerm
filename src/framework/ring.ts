export class RingBuffer<T> {
  private items: T[] = [];

  constructor(readonly capacity: number) {
    if (capacity < 1) throw new Error("RingBuffer capacity must be at least 1");
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) {
      this.items.splice(0, this.items.length - this.capacity);
    }
  }

  toArray(): T[] {
    return this.items.slice();
  }

  get length(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}
