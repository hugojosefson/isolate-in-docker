#!/bin/sh
// 2>/dev/null;DENO_VERSION_RANGE="^1.17.1";DENO_RUN_ARGS="--unstable --allow-run --allow-env --allow-read --allow-write";: "Via https://github.com/hugojosefson/deno-shebang CC BY 4.0";set -e;V="$DENO_VERSION_RANGE";A="$DENO_RUN_ARGS";U="$(expr "$(echo "$V"|curl -Gso/dev/null -w%{url_effective} --data-urlencode @- "")" : '..\(.*\)...')";D="$(command -v deno||true)";t(){ d="$(mktemp)";rm "${d}";dirname "${d}";};f(){ m="$(command -v "$0"||true)";l="/* 2>/dev/null";! [ -z $m ]&&[ -r $m ]&&[ "$(head -c3 "$m")" = '#!/' ]&&(read x && read y &&[ "$x" = "#!/bin/sh" ]&&[ "$l" != "${y%"$l"*}" ])<"$m";};a(){ [ -n $D ];};s(){ a&&[ -x "$R/deno" ]&&[ "$R/deno" = "$D" ]&&return;deno eval "import{satisfies as e}from'https://deno.land/x/semver@v1.3.0/mod.ts';Deno.exit(e(Deno.version.deno,'$V')?0:1);">/dev/null 2>&1;};g(){ curl -sSfL "https://api.mattandre.ws/semver/github/denoland/deno/$U";};e(){ R="$(t)/deno-range-$V/bin";mkdir -p "$R";export PATH="$R:$PATH";[ -x "$R/deno" ]&&return;a&&s&&([ -L "$R/deno" ]||ln -s "$D" "$R/deno")&&return;v="$(g)";i="$(t)/deno-$v";[ -L "$R/deno" ]||ln -s "$i/bin/deno" "$R/deno";s && return;curl -fsSL https://deno.land/x/install/install.sh|DENO_INSTALL="$i" sh -s "$v">&2;};exec env ISOLATE_IN_DOCKER_EXEC_PATH="$0" deno run $A "$(readlink -fn "$0")" "$@"

// This file is not meant to be executed directly.
// It should be executed via a symlink, named the same as the executable you wish to execute inside the Docker image.

// Documentation at https://github.com/hugojosefson/isolate-in-docker#readme

import { readAll } from "https://deno.land/std@0.119.0/streams/conversion.ts";
import cstring from "https://deno.land/x/cstring@v1.0/mod.js";
import { basename, resolve } from "https://deno.land/std@0.119.0/path/mod.ts";
import {
  ensureDir,
  ensureFile,
  move,
} from "https://deno.land/std@0.119.0/fs/mod.ts";

function s(a: unknown, indent = 0): string {
  return JSON.stringify(a, null, indent);
}

function isStringNotEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function trim(value?: string): string {
  if (typeof value === "undefined") {
    return "";
  }
  return value.trim();
}

function requireEnv(envVariable: string): string {
  const value = trim(Deno.env.get(envVariable));
  if (!isStringNotEmpty(value)) {
    throw new Error(
      `ERROR. Environment variable ${
        s(envVariable)
      } was not set to a non-empty string.`,
    );
  }
  return value;
}

// Default, if none specified in $NODE_VERSION nor in ./.nvmrc
const DEFAULT_NODE_VERSION = "latest";

async function run(cmd: string[], requireSuccess = true): Promise<string> {
  const process: Deno.Process = Deno.run({ cmd, stdout: "piped" });
  if (requireSuccess && !(await process.status()).success) {
    throw new Error(`ERROR while running cmd: ${cmd}`);
  }

  return process.stdout === null
    ? ""
    : new TextDecoder().decode(await readAll(process.stdout)).trim();
}

function assertNumber(value: unknown): value is number | never {
  if (typeof value === "number") {
    return true;
  }
  throw new Error(`ERROR. Not a number: ${s(value)}`);
}

// Docker arguments for allowing the container to access the host's docker engine, in case $DOCKERCEPTION is set.
async function getDockerceptionArgs(): Promise<string[]> {
  if (!Deno.env.get("DOCKERCEPTION")) return [];

  const dockerSock = (await run([
    ...["docker", "context", "inspect"],
    ...["-f", "{{.Endpoints.docker.Host}}"],
  ])).replaceAll(/^unix:\/\//, "");
  const dockerSockGid = (await Deno.stat(dockerSock)).gid;
  const dockerBin = await run(["command", "-v", "docker"]);

  assertNumber(dockerSockGid);

  return [
    ...["--group-add", `${dockerSockGid as number}`],
    ...["--volume", [dockerSock, dockerSock].join(":")],
    ...["--volume", [dockerBin, dockerBin, "ro"].join(":")],
  ];
}

function getLinkName(): string {
  return basename(requireEnv("ISOLATE_IN_DOCKER_EXEC_PATH"));
}

function getDockerWorkdir(): string {
  return Deno.env.get("DOCKER_WORKDIR") ?? Deno.cwd();
}

function rand(length = 32): string {
  return cstring(length);
}

function safeName(unsafeName: string): string {
  return `${unsafeName}`
    .trim()
    .replaceAll(/\n/g, "")
    .replace(/^\/$/, "root")
    .replace(/^\/-/, "root-")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replaceAll(/[^a-zA-Z0-9_.-]/g, "_");
}

function getConfigDirReadme(): string {
  return `-------------------------------------------------------------------------------
Config dir for isolate-in-docker tools
when in: ${Deno.cwd()}
-------------------------------------------------------------------------------

NOTE! This config directory is specific for ${Deno.cwd()}
and used only when your current working directory is that directory!

You may create a file here for each tool you use (named as the symlink, with the
extension .rc, for example "${getLinkName()}.rc"). If you do, it will be sourced
before running that tool.

You may declare environment variables in the configuration file. For details, see:
https://github.com/hugojosefson/isolate-in-docker#configuration-options

Additionally, if you create a file named "default.rc", it will be sourced
before all isolate-in-docker tools, before the specific tool's config file.
`;
}

async function getDockerUser(): Promise<string> {
  return Deno.env.get("DOCKER_USER") ??
    `${await run(["id", "-u"])}:${await run(["id", "-g"])}`;
}

async function getNodeVersion(): Promise<string> {
  try {
    const fromEnv = Deno.env.get("NODE_VERSION");
    if (isStringNotEmpty(fromEnv)) {
      return fromEnv;
    }
  } catch (err) {
    console.error(err);
    // fall through to next
  }

  try {
    const fromNvmrc = (await Deno.readTextFile(resolve(Deno.cwd(), ".nvmrc")))
      .trim();
    if (isStringNotEmpty(fromNvmrc)) {
      return fromNvmrc;
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      console.error(err);
    }
    // fall through to next
  }

  return DEFAULT_NODE_VERSION;
}

function getDockerCmd(): string[] {
  const fromEnv = Deno.env.get("DOCKER_CMD");
  if (isStringNotEmpty(fromEnv)) {
    return fromEnv.split(" ");
  }

  const linkName: string = getLinkName();
  if (linkName === "firefox40") {
    return ["/opt/firefox/firefox-bin", "--new-instance"];
  }
  if (linkName === "signal-desktop") {
    return ["signal-desktop", "--no-sandbox"];
  }
  return [linkName];
}

function getDockerExtraArgs(): string[] {
  const fromEnv = Deno.env.get("DOCKER_EXTRA_ARGS");
  if (isStringNotEmpty(fromEnv)) {
    return fromEnv.split(" ");
  }
  return [];
}

async function getWebstormDockerImageDockerArgs(): Promise<string[]> {
  return [
    ...["--device", "/dev/dri:/dev/dri"],
    ...["--user", "root:root"],
    ...["--env", `USER_ID=${await run(["id", "-u"])}`],
    ...["--env", `USER_NAME=${await run(["id", "-un"])}`],
    ...["--env", `GROUP_ID=${await run(["id", "-g"])}`],
    ...["--env", `GROUP_NAME=${await run(["id", "-gn"])}`],
  ];
}

async function getDockerImage(): Promise<string[]> {
  const fromEnv = Deno.env.get("DOCKER_IMAGE");
  if (isStringNotEmpty(fromEnv)) {
    return [fromEnv];
  }

  const linkName: string = getLinkName();

  switch (linkName) {
    case "node":
    case "npm":
    case "npx":
    case "yarn":
      return [
        ...(Deno.env.get("NODE_ENV")
          ? ["--env", `NODE_ENV=${Deno.env.get("NODE_ENV")}`]
          : []),
        `node:${await getNodeVersion()}`,
      ];
    case "firefox40":
      return [
        ...["--device", "/dev/dri:/dev/dri"],
        "netcapsule/firefox",
      ];
    case "webstorm":
    case "webstorm-install-rust":
    case "clion":
      return [
        ...await getWebstormDockerImageDockerArgs(),
        "hugojosefson/webstorm",
      ];
    case "goland":
    case "jetbrains-toolbox":
      return [
        ...await getWebstormDockerImageDockerArgs(),
        "hugojosefson/goland",
      ];
    case "pulseUi":
      return [
        ...["--cap-add", "NET_ADMIN"],
        ...["--cap-add", "SYS_ADMIN"],
        ...["--cap-add", "MKNOD"],
        ...["--device", "/dev/net/tun:/dev/net/tun"],
        ...await getWebstormDockerImageDockerArgs(),
        "hugojosefson/pulsevpn",
      ];
    case "git-revise":
      return [
        ...[
          "-v",
          [
            `${Deno.env.get("HOME")}/.gitconfig`,
            `${Deno.env.get("HOME")}/.gitconfig`,
            `ro`,
          ].join(":"),
        ],
        "hugojosefson/git-revise",
      ];
    case "signal-desktop":
      return [
        ...await getWebstormDockerImageDockerArgs(),
        "hugojosefson/signal-desktop",
      ];
    case "aws":
      return ["mikesir87/aws-cli"];
    case "heroku":
      return ["dickeyxxx/heroku-cli"];
    case "mvn":
    case "jaotc":
    case "jar":
    case "jarsigner":
    case "java":
    case "javac":
    case "javadoc":
    case "javap":
    case "jcmd":
    case "jconsole":
    case "jdb":
    case "jdeprscan":
    case "jdeps":
    case "jhsdb":
    case "jimage":
    case "jinfo":
    case "jjs":
    case "jlink":
    case "jmap":
    case "jmod":
    case "jps":
    case "jrunscript":
    case "jshell":
    case "jstack":
    case "jstat":
    case "jstatd":
    case "keytool":
    case "pack200":
    case "rmic":
    case "rmid":
    case "rmiregistry":
    case "serialver":
    case "unpack200":
      return [
        ...["--device", "/dev/urandom:/dev/urandom"],
        "maven",
      ];
    case "cargo":
    case "cargo-clippy":
    case "cargo-fmt":
    case "cargo-miri":
    case "clippy-driver":
    case "rls":
    case "rust-gdb":
    case "rust-lldb":
    case "rustc":
    case "rustdoc":
    case "rustfmt":
    case "rustup":
      return ["rust"];
    default:
      throw new Error(`ERROR: Unknown link name ${s(linkName)}.`);
  }
}

/**
 * Are we in a TTY?
 */
function isTTY(): boolean {
  return Deno.isatty(Deno.stdin.rid);
}

/**
 * Are they running husky?
 */
function isHusky(): boolean {
  const huskyArg: string | undefined = Deno.args.find((arg) =>
    arg.includes("node_modules/husky/run.js")
  );
  return typeof huskyArg === "string";
}

/**
 * Do we have git installed?
 */
async function haveGit(): Promise<boolean> {
  try {
    await run(["git", "--version"]);
    return true;
  } catch (_ignore) {
    return false;
  }
}

/**
 * Is current directory a git repo?
 */
async function isGitRepo(): Promise<boolean> {
  try {
    return (await Deno.stat(resolve(Deno.cwd(), ".git"))).isDirectory;
  } catch (_ignore) {
    return false;
  }
}

async function readlinkF(
  path: string,
  alreadyVisited: string[] = [],
): Promise<string> {
  if (alreadyVisited.includes(path)) {
    throw new Error(`ERROR: Circular symlink chain ${s(alreadyVisited)}`);
  }
  if (!await isSymlink(path)) {
    return path;
  }
  return await readlinkF(await Deno.readLink(path), [
    ...alreadyVisited,
    path,
  ]);
}

async function isCalledDirectly(): Promise<boolean> {
  const linkName: string = getLinkName();
  const linkTarget: string = await readlinkF(linkName);
  return linkName === linkTarget;
}

async function moveIfExists(oldPath: string, newPath: string): Promise<void> {
  try {
    await ensureDir(resolve(newPath, ".."));
    await move(oldPath, newPath);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return;
    }
    throw err;
  }
}

async function createIsolation(): Promise<string> {
  if (!await isGitRepo()) {
    await run(["git", "init"]);
  }
  const isolationPath = resolve(
    Deno.cwd(),
    ".git",
    "info",
    ".isolate-in-docker",
  );
  const oldIsolationPath = resolve(Deno.cwd(), ".isolate-in-docker");
  await migrateIfSymlink(resolve(oldIsolationPath, "home"));
  await migrateIfSymlink(resolve(oldIsolationPath, "config"));
  await moveIfExists(oldIsolationPath, isolationPath);
  await Promise.all(
    ["empty", "home", "config"]
      .map((dir) => resolve(isolationPath, dir))
      .map(ensureDir),
  );
  if (await haveGit()) {
    await writeGitUserToConfig(isolationPath);
  }
  return isolationPath;
}

function gitConfigForFile(gitConfigFile: string) {
  return async function gitConfig(
    args: string[],
    requireSuccess: boolean,
  ): Promise<void> {
    await run(
      ["git", "config", "--file", gitConfigFile, ...args],
      requireSuccess,
    );
  };
}

/**
 * Write current git user config to ${isolationPath}/home/.gitconfig, so it is visible inside the Docker container.
 */
async function writeGitUserToConfig(isolationPath: string): Promise<void> {
  const gitEmail = await run("git config user.email".split(" "));
  const gitName = await run("git config user.name".split(" "));

  const gitConfigFile = resolve(isolationPath, "home", ".gitconfig");
  await ensureFile(gitConfigFile);

  const gitConfig = gitConfigForFile(gitConfigFile);
  await gitConfig(["--unset-all", "user.email"], false);
  await gitConfig(["--unset-all", "user.name"], false);
  await gitConfig(["--add", "user.email", gitEmail], true);
  await gitConfig(["--add", "user.name", gitName], true);
}

async function isSymlink(path: string): Promise<boolean> {
  try {
    return (await Deno.lstat(path)).isSymlink;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return false;
    }
    throw err;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  return (await Deno.lstat(path)).isDirectory;
}

/**
 * Migrates any symlinked directories from previous versions of isolate-in-docker.
 */
async function migrateIfSymlink(correctPath: string): Promise<void> {
  try {
    const correctPathStat: Deno.FileInfo = await Deno.lstat(correctPath);
    if (correctPathStat.isSymlink) {
      const symlink = correctPath;
      const symlinkTarget = await readlinkF(symlink);
      if (await isDirectory(symlinkTarget)) {
        const symlinkTargetDir = symlinkTarget;
        await Deno.remove(symlink);
        await move(symlinkTargetDir, correctPath);
      } else {
        await move(symlink, symlink + ".old");
      }
    } else if (!correctPathStat.isDirectory) {
      await move(correctPath, correctPath + ".old");
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return;
    }
    throw err;
  }
}

async function getDockerWorkdirArgs(isolationPath: string): Promise<string[]> {
  const dockerWorkdir = getDockerWorkdir();
  if (dockerWorkdir === "/") {
    return ["--workdir", "/host-root", "--volume", "/:/host-root"];
  } else {
    await ensureDir(resolve(isolationPath, "home"));
    return [];
  }
}

function getDockerName(): string {
  const fromEnv = Deno.env.get("DOCKER_NAME");
  if (isStringNotEmpty(fromEnv)) {
    return fromEnv;
  }

  const dockerWorkdir = getDockerWorkdir();
  const dirName = basename(dockerWorkdir);
  const date = new Date().toISOString()
    .replaceAll(/:/g, "")
    .replace(/\.\d+/, "");
  const random = rand(4);
  return safeName([dirName, date, random].join("-"));
}
function getDockerHostname(): string {
  const fromEnv1 = Deno.env.get("DOCKER_HOSTNAME");
  if (isStringNotEmpty(fromEnv1)) {
    return fromEnv1;
  }

  const fromEnv2 = Deno.env.get("DOCKER_NAME");
  if (isStringNotEmpty(fromEnv2)) {
    return fromEnv2;
  }

  const dockerWorkdir = getDockerWorkdir();
  const dirName = basename(dockerWorkdir);
  return safeName(dirName);
}

function getDockerNet(): string {
  const fromEnv = Deno.env.get("DOCKER_NET");
  if (isStringNotEmpty(fromEnv)) {
    return fromEnv;
  }

  return "host";
}

async function createConfigReadme(isolationPath: string): Promise<void> {
  const configDir = resolve(isolationPath, "config");
  await ensureDir(configDir);
  await Deno.writeTextFile(resolve(configDir, "README"), getConfigDirReadme());
}

/**
 * Configurable env variables
 */
async function readConfigFilesIntoEnv(isolationPath: string): Promise<void> {
  const configDir = resolve(isolationPath, "config");
  await readConfigFileIntoEnvIfExists(resolve(configDir, "default.rc"));
  await readConfigFileIntoEnvIfExists(
    resolve(configDir, `${getLinkName()}.rc`),
  );
}

async function readConfigFileIntoEnvIfExists(path: string): Promise<void> {
  try {
    const contents: string = await Deno.readTextFile(path);
    const lines: string[] = contents.split("\n");
    lines
      .map(String.prototype.trim)
      .filter((line: string) => !line.startsWith("#"))
      .filter((line: string) => line.includes("="))
      .map((line: string) => line.match(/^([^=]+)=(.*)/))
      .filter((nullOrArray: null | RegExpMatchArray) => !!nullOrArray)
      .map((a) => a as string[])
      .map(([_line, ...matches]: string[]) => matches)
      .filter((matches) => matches.length === 2)
      .map((a) => a as [string, string])
      .forEach(([key, value]) => Deno.env.set(key, value));
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return;
    }
    throw err;
  }
}

async function main(): Promise<void> {
  if (await isCalledDirectly()) {
    console.error(`This script is meant to be executed via a symlink.
Please see https://github.com/hugojosefson/isolate-in-docker#readme for installation instructions.`);
    Deno.exit(1);
  }

  const isolationPath: string = await createIsolation();
  await createConfigReadme(isolationPath);
  await readConfigFilesIntoEnv(isolationPath);

  const port = Deno.env.get("PORT");
  const emptyDir = resolve(isolationPath, "empty");
  const homeDir = resolve(isolationPath, "home");
  const actualHome = Deno.env.get("HOME");
  const actualX11 = "/tmp/.X11-unix";
  const actualDisplay = Deno.env.get("DISPLAY");
  const cmd = [
    ...["docker", "run"],
    "--rm",
    "--interactive",
    "--init",
    ...(isTTY() && !isHusky() ? ["--tty"] : []),
    ...["-a", "stdin", "-a", "stdout", "-a", "stderr"],
    ...["--name", getDockerName()],
    ...["--hostname", getDockerHostname()],
    ...["--net", getDockerNet()],
    ...["--user", await getDockerUser()],
    ...await getDockerWorkdirArgs(isolationPath),
    ...["--volume", [getDockerWorkdir(), getDockerWorkdir()].join(":")],
    ...["--volume", [emptyDir, emptyDir, "ro"].join(":")],
    ...["--volume", [homeDir, actualHome].join(":")],
    ...["--volume", [actualX11, actualX11].join(":")],
    ...await getDockerceptionArgs(),
    ...["--env", ["HOME", actualHome].join("=")],
    ...["--env", ["DISPLAY", actualDisplay].join("=")],
    ...(isStringNotEmpty(port) ? ["--env", `PORT`] : []),
    ...await getDockerImage(),
    ...getDockerExtraArgs(),
    ...getDockerCmd(),
    ...Deno.args,
  ];

  console.error(s({ cmd }, 2));

  const process: Deno.Process = Deno.run({
    cmd,
    // stdin: Deno.stdin.rid,
    // stdout: Deno.stdout.rid,
    // stderr: Deno.stderr.rid,
  });
  const status = await process.status();
  Deno.exit(status.code);
}

await main();
