#!/bin/sh
// 2>/dev/null;DENO_VERSION_RANGE="^1.17.1";DENO_RUN_ARGS="--unstable --allow-run --allow-env --allow-read";: "Via https://github.com/hugojosefson/deno-shebang CC BY 4.0";set -e;V="$DENO_VERSION_RANGE";A="$DENO_RUN_ARGS";U="$(expr "$(echo "$V"|curl -Gso/dev/null -w%{url_effective} --data-urlencode @- "")" : '..\(.*\)...')";D="$(command -v deno||true)";t(){ d="$(mktemp)";rm "${d}";dirname "${d}";};f(){ m="$(command -v "$0"||true)";l="/* 2>/dev/null";! [ -z $m ]&&[ -r $m ]&&[ "$(head -c3 "$m")" = '#!/' ]&&(read x && read y &&[ "$x" = "#!/bin/sh" ]&&[ "$l" != "${y%"$l"*}" ])<"$m";};a(){ [ -n $D ];};s(){ a&&[ -x "$R/deno" ]&&[ "$R/deno" = "$D" ]&&return;deno eval "import{satisfies as e}from'https://deno.land/x/semver@v1.3.0/mod.ts';Deno.exit(e(Deno.version.deno,'$V')?0:1);">/dev/null 2>&1;};g(){ curl -sSfL "https://api.mattandre.ws/semver/github/denoland/deno/$U";};e(){ R="$(t)/deno-range-$V/bin";mkdir -p "$R";export PATH="$R:$PATH";[ -x "$R/deno" ]&&return;a&&s&&([ -L "$R/deno" ]||ln -s "$D" "$R/deno")&&return;v="$(g)";i="$(t)/deno-$v";[ -L "$R/deno" ]||ln -s "$i/bin/deno" "$R/deno";s && return;curl -fsSL https://deno.land/x/install/install.sh|DENO_INSTALL="$i" sh -s "$v">&2;};e;exec env ISOLATE_IN_DOCKER_LINK_NAME="$(basename "$0")" deno run $A - "$@"<<'//🔚'

// This file is not meant to be executed directly.
// It should be executed via a symlink, named the same as the executable you wish to execute inside the Docker image.

// Documentation at https://github.com/hugojosefson/isolate-in-docker#readme

import { readAll } from "https://deno.land/std@0.119.0/streams/conversion.ts";
import cstring from "https://deno.land/x/cstring@v1.0/mod.js";
import { join } from "https://deno.land/std@0.119.0/path/mod.ts";

const s = JSON.stringify;

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

async function run(cmd: string[]): Promise<string> {
  const process: Deno.Process = Deno.run({ cmd, stdout: "piped" });
  if (!(await process.status()).success) {
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
    "docker",
    "context",
    "inspect",
    "-f",
    "{{.Endpoints.docker.Host}}",
  ])).replaceAll(/^unix:\/\//, "");
  const dockerSockGid = (await Deno.stat(dockerSock)).gid;
  const dockerBin = await run(["command", "-v", "docker"]);

  assertNumber(dockerSockGid);

  return [
    "--group-add",
    `${dockerSockGid as number}`,
    "-v",
    dockerSock + ":" + dockerSock,
    "-v",
    dockerBin + ":" + dockerBin + ":ro",
  ];
}

function getLinkName(): string {
  return requireEnv("ISOLATE_IN_DOCKER_LINK_NAME");
}

function getDockerWorkdir(): string {
  return Deno.env.get("DOCKER_WORKDIR") ?? Deno.cwd();
}

function rand(): string {
  return cstring(32);
}

function safeName(unsafeName: string): string {
  return `${unsafeName}`
    .trim()
    .replaceAll(/\n/g, "")
    .replaceAll(/^\/$/, "root")
    .replaceAll(/^\/-/, "root-")
    .replaceAll(/^[^a-zA-Z0-9]+/, "")
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
    const fromNvmrc = (await Deno.readTextFile(join(Deno.cwd(), ".nvmrc")))
      .trim();
    if (isStringNotEmpty(fromNvmrc)) {
      return fromNvmrc;
    }
  } catch (err) {
    console.error(err);
    // fall through to next
  }

  return DEFAULT_NODE_VERSION;
}

function getDockerCmd(): string[] {
  const fromEnv = Deno.env.get("DOCKER_CMD");
  if (isStringNotEmpty(fromEnv)) {
    return [fromEnv];
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
        ...["--env", `NODE_ENV=${Deno.env.get("NODE_ENV")}`],
        `node:${getNodeVersion}`,
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
    await run(["sh", "-c", "command -v git"]);
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
    return (await Deno.stat(join(Deno.cwd(), ".git"))).isDirectory;
  } catch (_ignore) {
    return false;
  }
}

console.log(
  `isGitRepo: ${await isGitRepo()}`,
);

Deno.exit(0);
/*

# Write current git user config to .isolate-in-docker/home/.gitconfig, so it is visible inside the Docker container.
function writeGitUserToConfig() {
  local gitEmail="$(git config user.email)"
  local gitName="$(git config user.name)"

  gitConfigFile=".isolate-in-docker/home/.gitconfig"
  mkdir -p "$(dirname ${gitConfigFile})"
  touch "${gitConfigFile}"
  git config --file "${gitConfigFile}" --unset-all user.email || true
  git config --file "${gitConfigFile}" --unset-all user.name || true
  git config --file "${gitConfigFile}" --add user.email "${gitEmail}"
  git config --file "${gitConfigFile}" --add user.name "${gitName}"
}

function ensureInFile() {
  local file="${1}"
  local line="${2}"
  if ! grep -x "${line}" "${file}" >/dev/null; then
    echo >> "${file}"
    echo "${line}" >> "${file}"
  fi
}

# Migrates any symlinked directories from previous versions of isolate-in-docker
function migrateIfSymlink() {
  local name="${1}"
  if [[ -L "${name}" ]]; then
    local targetDir="$(readlink -f "${name}")"
    if [[ -d "${targetDir}" ]]; then
      rm -f "${name}"
      mv "${targetDir}" "${name}"
    else
      mv "${name}" "${name}.old"
    fi
  elif exists "${name}" && [[ ! -d "${name}" ]]; then
      mv "${name}" "${name}.old"
  fi
}

# Creates a directory .isolate-in-docker, with home and config.
function createIsolation() {
  if isGitRepo; then
    ensureInFile .git/info/exclude .isolate-in-docker/
  fi

  migrateIfSymlink .isolate-in-docker/home
  migrateIfSymlink .isolate-in-docker/config

  mkdir -p .isolate-in-docker/empty
  mkdir -p .isolate-in-docker/home
  mkdir -p .isolate-in-docker/config

  if isGitRepo && haveGit; then
    writeGitUserToConfig
  fi
}


function readConfigFiles() {
  local configDir=".isolate-in-docker/config"
  mkdir -p "${configDir}"
  getConfigDirReadme > "${configDir}/README"
  sourceFileIfExists "${configDir}/default.rc"
  sourceFileIfExists "${configDir}/$(getLinkName).rc"
}


# Check how we were called
if [[ "$(basename "${0}")" == "$(basename $(readlink -f ${0}))" ]]; then
    echo "This script is meant to be executed via a symlink. \
Please see https://github.com/hugojosefson/isolate-in-docker#readme for installation instructions." >&2
    exit 1
fi

# Program starts here
createIsolation

# Configurable env variables
readConfigFiles

DOCKER_IMAGE="$(getDockerImage)"
DOCKER_USER=$(getDockerUser)
DOCKER_WORKDIR="$(getDockerWorkdir)"
DOCKER_CMD="$(getDockerCmd)"
DOCKER_EXTRA_ARGS="${DOCKER_EXTRA_ARGS:-}"
DOCKER_HOSTNAME="${DOCKER_HOSTNAME:-${DOCKER_NAME:-$(basename "${DOCKER_WORKDIR}" | safeName)}}"
DOCKER_NAME="${DOCKER_NAME:-$(echo $(basename "${DOCKER_WORKDIR}")-$(date --utc --iso-8601=seconds | sed -E 's/://g' | sed -E 's/\+0000/Z/g')-$(rand 4) | safeName)}"
DOCKER_NET="${DOCKER_NET:-host}"

if isTTY && ! isHusky "$@"; then
  TTY_ARG="--tty"
else
  TTY_ARG=""
fi

if [[ ! -z "${PORT}" ]]; then
  PORT_ARGS="--env PORT=${PORT}"
else
  PORT_ARGS=""
fi

if [[ "${DOCKER_WORKDIR}" == "/" ]]; then
  DOCKER_WORKDIR_ARGS="--workdir /host-root --volume /:/host-root"
else
  mkdir -p ".isolate-in-docker/home${DOCKER_WORKDIR#"$HOME"}"
  DOCKER_WORKDIR_ARGS="--workdir ${DOCKER_WORKDIR} --volume ${DOCKER_WORKDIR}:${DOCKER_WORKDIR}"
fi

exec docker run \
  --rm \
  --interactive \
  --init \
  -a stdin -a stdout -a stderr \
  ${TTY_ARG} \
  --name "${DOCKER_NAME}" \
  --hostname "${DOCKER_HOSTNAME}" \
  --user ${DOCKER_USER} \
  ${DOCKER_WORKDIR_ARGS} \
  --volume "$(pwd)/.isolate-in-docker/empty":"$(pwd)/.isolate-in-docker":ro \
  --volume "$(pwd)/.isolate-in-docker/home":"${HOME}" \
  --env HOME="${HOME}" \
  --volume /tmp/.X11-unix:/tmp/.X11-unix \
  --env DISPLAY="${DISPLAY}" \
  ${PORT_ARGS} \
  $(maybeDockerception) \
  --net="${DOCKER_NET}" \
  ${DOCKER_EXTRA_ARGS} \
  ${DOCKER_IMAGE} \
  ${DOCKER_CMD} "$@"
*/

//🔚
