// Inspector CPU profiling for explicitly enabled isolated harness children only.
// It never opens an inspector port and is never loaded by the app deployment.
'use strict';
if (process.env.ISOLATED_PERFORMANCE_CPU_PROFILE === '1' && process.env.ISOLATED_PERFORMANCE_CPU_DIRECTORY && typeof process.send === 'function') {
  const { Session } = require('node:inspector');
  const { writeFile } = require('node:fs/promises');
  const { resolve } = require('node:path');
  const session = new Session();
  session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  let active = false, pending = Promise.resolve();
  process.on('message', message => {
    if (message?.type !== 'isolated-performance-cpu-control') return;
    // Serialize commands so shutdown cannot race the start acknowledgement.
    pending = pending.then(async () => {
      try {
        if (message.command === 'start') {
          if (active) throw new Error('An isolated CPU profile is already active');
          await post('Profiler.enable');
          await post('Profiler.setSamplingInterval', { interval: 1000 });
          await post('Profiler.start');
          active = true;
          process.send({ type: 'isolated-performance-cpu-result', requestId: message.requestId, ok: true });
        } else if (message.command === 'stop') {
          if (!active) throw new Error('No isolated CPU profile is active');
          if (typeof message.fileName !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.cpuprofile$/.test(message.fileName)) throw new Error('CPU profile requires a generated local basename');
          const { profile } = await post('Profiler.stop');
          active = false;
          const filePath = resolve(process.env.ISOLATED_PERFORMANCE_CPU_DIRECTORY, message.fileName);
          await writeFile(filePath, JSON.stringify(profile) + '\n', { flag: 'wx' });
          await post('Profiler.disable');
          process.send({ type: 'isolated-performance-cpu-result', requestId: message.requestId, ok: true, filePath });
        } else throw new Error('Unknown isolated CPU profile command');
      } catch (error) {
        if (process.connected) process.send({ type: 'isolated-performance-cpu-result', requestId: message.requestId, ok: false, error: error.message });
      }
    });
  });
}
