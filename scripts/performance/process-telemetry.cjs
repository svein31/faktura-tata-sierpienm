// Diagnostic preload for the isolated load harness only. Never loaded by the app deployment.
'use strict';
if (process.env.ISOLATED_PERFORMANCE_TELEMETRY === '1' && typeof process.send === 'function') {
  const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let previousCpu = process.cpuUsage(), previousTime = performance.now();
  const milliseconds = nanoseconds => Number.isFinite(nanoseconds) ? nanoseconds / 1e6 : null;
  const timer = setInterval(() => {
    const now = performance.now(), cpu = process.cpuUsage(), elapsedMs = now - previousTime;
    const message = {
      type: 'isolated-performance-telemetry', elapsedMs,
      cpuMs: { user: (cpu.user - previousCpu.user) / 1000, system: (cpu.system - previousCpu.system) / 1000 },
      memoryBytes: process.memoryUsage(),
      eventLoopDelayMs: { mean: milliseconds(delay.mean), p50: milliseconds(delay.percentile(50)), p95: milliseconds(delay.percentile(95)), p99: milliseconds(delay.percentile(99)), max: milliseconds(delay.max) },
    };
    previousCpu = cpu; previousTime = now; delay.reset();
    if (process.connected) {
      try { process.send(message, () => {}); } catch { /* Parent stopped; no application behavior changes. */ }
    }
  }, 1000);
  timer.unref();
}
