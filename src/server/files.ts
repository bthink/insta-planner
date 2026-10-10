import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function configuredRoot(): string {
  const configured =
    process.env.INSTAPLANNER_DATA_DIR || "~/Pictures/InstaPlanner-data";
  const root = path.resolve(
    configured.startsWith("~/")
      ? path.join(os.homedir(), configured.slice(2))
      : configured,
  );
  const repo = path.resolve(process.cwd());
  if (root === repo || root.startsWith(repo + path.sep))
    throw new Error(
      "Folder danych musi znajdować się poza repozytorium. Ustaw INSTAPLANNER_DATA_DIR w .env.local.",
    );
  return root;
}

// Check every existing component, including ancestors of the data directory.
export function rejectSymlinks(absolute: string): void {
  const resolved = path.resolve(absolute);
  let current = path.parse(resolved).root;
  for (const component of resolved
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, component);
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw new Error(
          "Dowiązania symboliczne w folderze danych nie są obsługiwane.",
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function safePath(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    !target.startsWith(path.resolve(root) + path.sep)
  )
    throw new Error("Nieprawidłowa ścieżka danych.");
  rejectSymlinks(target);
  return target;
}

export function initializeRoot(root: string): void {
  rejectSymlinks(root);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const dir of ["media", "miniatury", "kolejka", "eksporty", "backups"])
    fs.mkdirSync(safePath(root, dir), { recursive: true });
  fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK);
}

export function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/ł/g, "l")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "post"
  );
}

export function copyTree(source: string, destination: string): void {
  rejectSymlinks(source);
  rejectSymlinks(destination);
  fs.mkdirSync(destination, { recursive: true });
  for (const item of fs.readdirSync(source, { withFileTypes: true })) {
    if (item.isSymbolicLink())
      throw new Error("Kopia zapasowa nie obsługuje dowiązań symbolicznych.");
    const from = path.join(source, item.name),
      to = path.join(destination, item.name);
    if (item.isDirectory()) copyTree(from, to);
    else if (item.isFile()) fs.copyFileSync(from, to);
  }
}
