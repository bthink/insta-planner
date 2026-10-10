import { Store } from "../src/server/store";
import { configuredRoot } from "../src/server/files";
try {
  const response = await fetch("http://127.0.0.1:3210/api/health", {
    signal: AbortSignal.timeout(1500),
  }).catch(() => null);
  if (response)
    throw new Error(
      "Najpierw zatrzymaj aplikację albo utwórz kopię w jej ustawieniach.",
    );
  const store = new Store(configuredRoot());
  try {
    await store.ready;
    const relative = await store.lock(() => store.backup());
    console.log(`${store.root}/${relative}`);
  } finally {
    store.db.close();
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
