/**
 * Node.js preload script for `netlify dev`.
 *
 * Problem 1: Netlify CLI v23.x creates net.Socket instances (in its http-proxy
 * WebSocket tunnel and wait-port probe logic) that have no 'error' event
 * listener. On Node.js 24, when the socket receives an RST from Vite during
 * dep-optimisation startup, an ECONNRESET is emitted. Without a listener it
 * becomes an uncaught exception and kills the entire Netlify CLI process.
 *
 * Fix 1: Intercept EventEmitter#emit and silently swallow ECONNRESET / EPIPE
 * errors on net.Socket instances that have no registered error handler.
 *
 * Problem 2: Netlify CLI's proxy.on('error') handler calls res.writeHead(500)
 * for ALL proxy errors — including WebSocket upgrade failures. For WS upgrades,
 * `res` is a raw net.Socket (not http.ServerResponse), so writeHead doesn't
 * exist → TypeError → uncaught exception → crash.
 *
 * Fix 2: Add a writeHead shim to net.Socket.prototype that destroys the socket
 * instead of throwing. http.ServerResponse has its own writeHead so real HTTP
 * responses are completely unaffected.
 */
'use strict';

const net = require('net');
const EventEmitter = require('events');

// Fix 1: swallow ECONNRESET/EPIPE on bare sockets with no error listener
const originalEmit = EventEmitter.prototype.emit;
EventEmitter.prototype.emit = function patchedEmit(event, ...args) {
  if (
    event === 'error' &&
    this instanceof net.Socket &&
    this.listenerCount('error') === 0
  ) {
    const err = args[0];
    if (err && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
      return false;
    }
  }
  return originalEmit.apply(this, [event, ...args]);
};

// Fix 2: shim writeHead on net.Socket so WS-upgrade error paths don't throw.
// http.ServerResponse defines its own writeHead, so this only applies when
// http-proxy mistakenly passes a raw socket as the response object.
if (!net.Socket.prototype.writeHead) {
  net.Socket.prototype.writeHead = function shimWriteHead() {
    // Can't send HTTP headers over a raw socket — close it gracefully.
    this.destroy();
  };
}
