#!/usr/bin/env node

// For testing process signals in Node.js.

// Signals list fetched with this bash command:
// for i in $(curl -s https://raw.githubusercontent.com/torvalds/linux/master/include/linux/signal.h | awk '/^\s\*\s+.\s+SIG/{print $3}' | sed -r 'sX[/-]X\nXg'|sort -u); do echo -n "\"$i\", "; done > signals
const signals = ["SIGABRT", "SIGALRM", "SIGBUS", "SIGCHLD", "SIGCONT", "SIGEMT", "SIGFPE", "SIGHUP", "SIGILL", "SIGINT", "SIGIO", "SIGIOT", "SIGKILL", "SIGPIPE", "SIGPOLL", "SIGPROF", "SIGPWR", "SIGQUIT", "SIGRTMAX", "SIGRTMIN", "SIGSEGV", "SIGSTKFLT", "SIGSTOP", "SIGSYS", "SIGTERM", "SIGTRAP", "SIGTSTP", "SIGTTIN", "SIGTTOU", "SIGUNUSED", "SIGURG", "SIGUSR1", "SIGUSR2", "SIGVTALRM", "SIGWINCH", "SIGXCPU", "SIGXFSZ"]
const disabled = ["SIGKILL", "SIGSTOP"]
const isEnabled = signal => !disabled.includes(signal)

const registerSignalHandler = signal => {
  console.log(`Registering logger for ${signal}...`)
  process.on(signal, () => console.log(`Caught ${signal}.`))
}
signals
  .filter(isEnabled)
  .forEach(registerSignalHandler)

const normalExit = () => {
  console.log('Exiting normally.')
  process.exit(0)
}
console.log(`Registering normalExit for SIGINT...`)
process.on('SIGINT', normalExit)

console.log(`Registering normalExit for SIGTERM...`)
process.on('SIGTERM', normalExit)

console.log(`Registering setTimeout(normalExit, 60 seconds)...`)
setTimeout(() => normalExit, 60000)
