import fs from "node:fs";
import path from "node:path";
import { Store } from "../src/server/store";
import { copyTree, rejectSymlinks } from "../src/server/files";
const [sourceArg, destinationArg] = process.argv.slice(2);
try {
  if (!sourceArg || !destinationArg)
    throw new Error(
      'Użycie: npm run restore -- "/ścieżka/do/kopii" "/nowy/folder/danych"',
    );
  const source = path.resolve(sourceArg),
    destination = path.resolve(destinationArg);
  rejectSymlinks(source);
  rejectSymlinks(destination);
  const marker = JSON.parse(
    fs.readFileSync(path.join(source, "backup.json"), "utf8"),
  );
  if (marker.app !== "InstaPlanner" || marker.schema !== 1 || !marker.complete)
    throw new Error("To nie jest kompletna kopia InstaPlannera.");
  if (fs.existsSync(destination))
    throw new Error(
      "Folder docelowy już istnieje. Wybierz nowy, aby nie nadpisać danych.",
    );
  const repository = path.resolve(process.cwd());
  if (
    destination === repository ||
    destination.startsWith(repository + path.sep)
  )
    throw new Error("Folder danych musi znajdować się poza repozytorium.");
  if (destination.startsWith(source + path.sep))
    throw new Error("Folder odtworzenia musi być poza kopią.");
  copyTree(source, destination);
  const store = new Store(destination);
  try {
    await store.ready;
    const result = store.db.pragma("integrity_check", { simple: true });
    if (result !== "ok") throw new Error("Nieprawidłowa baza w kopii.");
    console.log(
      `Odtworzono ${store.accounts().length} kont w ${destination}. Ustaw INSTAPLANNER_DATA_DIR w .env.local i uruchom aplikację ponownie.`,
    );
  } finally {
    store.db.close();
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
