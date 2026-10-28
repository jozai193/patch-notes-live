import { createHub } from './hub.js';
const hub = await createHub({ log: console.log });
console.log(`Patch hub listening at ws://localhost:${hub.port}`);
let stopping = false;
const stop = () => {
  if (!stopping) {
    stopping = true;
    void hub.close().then(() => {
      process.exitCode = 0;
    });
  }
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
