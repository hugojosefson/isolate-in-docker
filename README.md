# node-via-docker-wrapper

Wrapper scripts for `docker run node ...`.

Lets you keep Node.js uninstalled in your main environment, to limit your
exposure to any malware that may be hosted on `npm` for short periods of time.

## Install

### Prerequisites

First, make sure you don't have any Node.js installation left. Make sure each
of these commands *fail*:

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

Note that only the current directory is available inside the docker instance
running each command. This should limit exposure.

### With access to NPM authentication inside Docker

For authentication related `npm` commands, such as `npm adduser` and `npm
publish`. You need access to your `~/.npm` directory and the `~/.npmrc` file
which contains your NPM credentials.

Then use it like this:

```bash
# TODO: Add relevant change.
npm adduser
npm publish
```
