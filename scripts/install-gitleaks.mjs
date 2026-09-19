// Pobiera gitleaks (windows/linux/mac) do .tools/gitleaks/ — używane przez .husky/pre-push.
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const plat = { win32: "windows", linux: "linux", darwin: "darwin" }[process.platform];
const arch = { x64: "x64", arm64: "arm64" }[process.arch];
if (!plat || !arch) throw new Error(`Nieobsługiwana platforma: ${process.platform}/${process.arch}`);

const rel = await (await fetch("https://api.github.com/repos/gitleaks/gitleaks/releases/latest")).json();
const ext = plat === "windows" ? "zip" : "tar.gz";
const asset = rel.assets.find((a) => a.name.endsWith(`_${plat}_${arch}.${ext}`));
if (!asset) throw new Error("Nie znaleziono paczki gitleaks dla tej platformy");

const dir = ".tools/gitleaks";
mkdirSync(dir, { recursive: true });
const archive = join(tmpdir(), asset.name);
writeFileSync(archive, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()));
// bsdtar (tar) rozpakowuje zarówno .zip (Windows 10+), jak i .tar.gz
execFileSync("tar", ["-xf", archive, "-C", dir, plat === "windows" ? "gitleaks.exe" : "gitleaks"], { stdio: "inherit" });
if (plat !== "windows") chmodSync(join(dir, "gitleaks"), 0o755);
console.log(`gitleaks ${rel.tag_name} zainstalowany w ${dir}`);
