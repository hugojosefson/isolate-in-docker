# node-via-docker-wrapper

Wrapper scripts for `docker run node ...`.

Lets you keep Node.js uninstalled in your main environment, to limit
your exposure to any malware that may be hosted on `npm` for short
periods of time.

## Install

### Prerequisites

First, make sure you don't have any Node.js installation left. Make sure
each of these commands *fail*:

```bash
which node
which npm
which npx
which yarn
```

If they don't fail, but instead find any executable, uninstall whatever
Node.js, `npm`, `yarn` that was left behind.

### Actual installation

```bash
curl https://raw.githubusercontent.com/hugojosefson/node-via-docker-wrapper/master/node-via-docker-wrapper -o /usr/local/bin/node-via-docker-wrapper
chmod +x /usr/local/bin/node-via-docker-wrapper
ln -s /usr/local/bin/node-via-docker-wrapper /usr/local/bin/node
ln -s /usr/local/bin/node-via-docker-wrapper /usr/local/bin/npm
ln -s /usr/local/bin/node-via-docker-wrapper /usr/local/bin/npx
ln -s /usr/local/bin/node-via-docker-wrapper /usr/local/bin/yarn
```

## Usage

Use just like regular `node`, `npm` etc.

```bash
node --version
npm init
yarn add express mocha
npm test
npx cowsay It works!
```

Note that only the current directory where you call the script from, is
available inside the docker instance. See `DOCKER_WORKDIR`
below.

### Configuration options

Options are configured with environment variables.

*(Table via
[tablesgenerator.com](https://www.tablesgenerator.com/markdown_tables))*

| Environment variable         | Specifies                                                                                                                                                  | Default value                                                                             | Example values                                                                                              | Valid values                                          |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|-------------------------------------------------------|
| `NODE_VERSION`               | Version of Node.js to use.                                                                                                                                 | `lts`                                                                                     | `8`, `10.2.2`, `stable`                                                                                     | Tags from https://hub.docker.com/_/node               |
| `PORT`              | Port number to pass through to the container's environment, and to `--publish`.                                                                            | `""`                                                                                      | `8000`, `1234`                                                                                              | Any port number.                                      |
| `DOCKER_IMAGE`      | Docker image to use.                                                                                                                                       | `node:$NODE_VERSION`                                                                      | `my-special-node:latest`                                                                                    | Any valid Docker image reference.                     |
| `DOCKER_USER`       | User, or `user:group` to become inside the container.                                                                                                      | Current user and group: `$(id -u):$(id -g)`                                               | `root`, `1000`, `1000:1000`                                                                                 | https://docs.docker.com/engine/reference/run/#user    |
| `DOCKER_WORKDIR`    | Where to execute the command inside the container. ***NOTE: Directory is shared with the container.***                                                     | Current directory: `$(pwd)`                                                               | `..`, `/tmp/somedir`                                                                                        | https://docs.docker.com/engine/reference/run/#workdir |
| `DOCKER_EXTRA_ARGS` | Any extra arguments to `docker run`.                                                                                                                       | `""`                                                                                      | `"--volume /opt/extralibs:/opt/extralibs"`,  `"--volume /opt/extralibs:/opt/extralibs --publish 8001:8001"` | https://docs.docker.com/engine/reference/run/         |
| `DOCKER_EXECUTABLE` | The executable to run inside the container: `node`, `npm` etc.                                                                                             | Name of the symlink pointing to this script: `$(basename "${0}")`                         | `bash`                                                                                                      | Any valid executable inside the Docker container.     |
| `CACHE_DIR`      | Directory on the host to hold the container's `$HOME` directory, which includes any cached `.npm/`, `.npmrc`, which may include login information for NPM. | Unique directory per workdir: `${HOME}/.cache/node-via-docker}${DOCKER_WORKDIR}` | `/tmp/common-npm-cache`                                                                                     | Any directory on the host.    |
|                     |                                                                                                                                                            |                                                                                           |                                                                                                             |                                                       |

### Examples

Some examples using the environment variables for configuration:

```bash
# Start the current project passing `PORT=3000` to the app, and publishing port 3000 to the host
PORT=3000 npm start

# Same, using Node.js version 8:
PORT=3000 NODE_VERSION=8 npm start

# Serve the current directory on port 3000:
PORT=3000 npx serve

```

## TODO

* Calculate `CACHE_IDENTIFIER` as `s/[^a-z0-9+=.-]//gi`
of workdir, plus a hash of workdir.
* Support a `node-via-docker.rc` in `CACHE_DIR`, which is
sourced for default configuration.
