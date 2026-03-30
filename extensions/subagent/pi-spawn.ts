/**
 * Cross-platform pi CLI spawn resolution.
 *
 * On Windows, `spawn("pi", ...)` with `shell: false` fails (ENOENT) because
 * there is no `pi.exe` — only a `.cmd` shim that requires cmd.exe. We resolve
 * the actual JS entry point and spawn `node <path>` directly instead.
 *
 * On non-Windows platforms, `spawn("pi", ...)` works fine as-is.
 */

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

export interface PiSpawnCommand {
	command: string;
	args: string[];
}

/**
 * Resolve the pi package root by walking up from process.argv[1].
 */
function resolvePiPackageRoot(): string | undefined {
	try {
		const entry = process.argv[1];
		if (!entry) return undefined;
		let dir = path.dirname(fs.realpathSync(entry));
		while (dir !== path.dirname(dir)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
				if (pkg.name === "@mariozechner/pi-coding-agent") return dir;
			} catch {
				// not a package.json or wrong package
			}
			dir = path.dirname(dir);
		}
	} catch {
		// argv[1] may not exist
	}
	return undefined;
}

/**
 * Find the pi CLI JavaScript entry point on Windows.
 * Checks process.argv[1] first, then resolves via package.json bin field.
 */
function resolveWindowsPiCliScript(): string | undefined {
	// Strategy 1: process.argv[1] — works when running inside pi
	const argv1 = process.argv[1];
	if (argv1) {
		const argvPath = path.isAbsolute(argv1) ? argv1 : path.resolve(argv1);
		if (fs.existsSync(argvPath) && /\.(?:mjs|cjs|js)$/i.test(argvPath)) {
			return argvPath;
		}
	}

	// Strategy 2: resolve via package.json bin field
	try {
		const require = createRequire(import.meta.url);
		const packageJsonPath = require.resolve("@mariozechner/pi-coding-agent/package.json");
		return resolveFromPackageJson(packageJsonPath);
	} catch {
		// can't resolve via require
	}

	// Strategy 3: resolvePiPackageRoot → walk up from argv[1]
	const pkgRoot = resolvePiPackageRoot();
	if (pkgRoot) {
		return resolveFromPackageJson(path.join(pkgRoot, "package.json"));
	}

	// Strategy 4: well-known global npm paths
	for (const candidate of [
		path.join(process.env.APPDATA ?? "", "npm", "node_modules", "@mariozechner", "pi-coding-agent", "dist", "cli.js"),
	]) {
		if (fs.existsSync(candidate)) return candidate;
	}

	return undefined;
}

function resolveFromPackageJson(packageJsonPath: string): string | undefined {
	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
			bin?: string | Record<string, string>;
		};
		const binField = packageJson.bin;
		const binPath =
			typeof binField === "string"
				? binField
				: binField?.pi ?? Object.values(binField ?? {})[0];
		if (!binPath) return undefined;
		const candidate = path.resolve(path.dirname(packageJsonPath), binPath);
		if (fs.existsSync(candidate) && /\.(?:mjs|cjs|js)$/i.test(candidate)) {
			return candidate;
		}
	} catch {
		// ignore
	}
	return undefined;
}

/**
 * Get the correct spawn command and args for invoking the pi CLI.
 *
 * On Windows: resolves the JS entry point and returns `{ command: "node", args: [<pi-path>, ...userArgs] }`
 * On other platforms: returns `{ command: "pi", args: [...userArgs] }`
 */
export function getPiSpawnCommand(userArgs: string[]): PiSpawnCommand {
	if (process.platform === "win32") {
		const piCliPath = resolveWindowsPiCliScript();
		if (piCliPath) {
			return {
				command: process.execPath,
				args: [piCliPath, ...userArgs],
			};
		}
	}

	return { command: "pi", args: userArgs };
}
