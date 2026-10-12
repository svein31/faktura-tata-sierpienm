import { ApiError } from "@/lib/api";
import { performance } from "node:perf_hooks";

type Entry = {
  deadline: number;
  resolve: (release: () => void) => void;
  reject: (error: ApiError) => void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort: () => void;
};

function busy() {
  return new ApiError(503, "Serwer przetwarza wiele dokumentów. Spróbuj ponownie za chwilę.", "WRITE_ADMISSION_BUSY");
}
function aborted() {
  return new ApiError(408, "Żądanie zostało przerwane.", "REQUEST_ABORTED");
}

/** Bounds active create transactions; queued requests hold no database transaction.
 * Authorization and all financial writes remain inside the admitted callback. */
export class InvoiceWriteAdmission {
  private active = 0;
  private readonly queue: Entry[] = [];

  constructor(private readonly concurrency = 8, private readonly maxQueue = 256, private readonly waitMs = 10000) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(maxQueue) || maxQueue < 0 || !Number.isFinite(waitMs) || waitMs <= 0) {
      throw new Error("Invalid invoice write admission limits");
    }
  }

  private release() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.drain();
    };
  }

  private cleanup(entry: Entry) {
    clearTimeout(entry.timer);
    entry.signal?.removeEventListener("abort", entry.onAbort);
  }

  private remove(entry: Entry, error: ApiError) {
    const index = this.queue.indexOf(entry);
    if (index === -1) return;
    this.queue.splice(index, 1);
    this.cleanup(entry);
    entry.reject(error);
    this.drain();
  }

  private drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const entry = this.queue.shift()!;
      this.cleanup(entry);
      if (entry.signal?.aborted) { entry.reject(aborted()); continue; }
      // Timers may be delayed by a busy event loop; expired work never starts.
      if (performance.now() >= entry.deadline) { entry.reject(busy()); continue; }
      this.active++;
      entry.resolve(this.release());
    }
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(aborted());
    if (this.active < this.concurrency && !this.queue.length) {
      this.active++;
      return Promise.resolve(this.release());
    }
    if (this.queue.length >= this.maxQueue) return Promise.reject(busy());
    return new Promise((resolve, reject) => {
      const entry: Entry = {
        deadline: performance.now() + this.waitMs,
        resolve, reject, signal,
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
        onAbort: () => this.remove(entry, aborted()),
      };
      entry.timer = setTimeout(() => this.remove(entry, busy()), this.waitMs);
      this.queue.push(entry);
      signal?.addEventListener("abort", entry.onAbort, { once: true });
    });
  }

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal);
    try {
      // Immediate admission also yields once; honor an abort before work starts.
      if (signal?.aborted) throw aborted();
      return await operation();
    } finally { release(); }
  }
}

// This is admission control per application process, not a substitute for the
// database company/period fences that coordinate multiple application workers.
export const invoiceWriteAdmission = new InvoiceWriteAdmission();
