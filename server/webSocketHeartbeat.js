export function trackWebSocketHeartbeat(socket) {
  socket.isAlive = true
  socket.on('pong', () => { socket.isAlive = true })
}

export function startWebSocketHeartbeat(wss, intervalMs) {
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.isAlive) {
        client.terminate()
        continue
      }
      client.isAlive = false
      client.ping()
    }
  }, intervalMs)
  const stop = () => clearInterval(heartbeat)
  wss.once('close', stop)
  return stop
}
