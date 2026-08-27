const PLAYBACK_RATES = new Set([0.5, 1, 2, 4])

function sendError(socket, error) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'fleet:error', message: error.message ?? 'Could not update the fleet.' }))
}

async function handleCommand(simulation, broadcast, message) {
  if (!message || typeof message !== 'object') return
  if (message.type === 'simulation:reset' || message.type === 'simulation:restart') simulation.reset()
  else if (message.type === 'simulation:set-speed' && PLAYBACK_RATES.has(message.playbackRate)) simulation.setPlaybackRate(message.playbackRate)
  else if (message.type === 'fleet:add') await simulation.addVehicle(message)
  else if (message.type === 'fleet:remove') simulation.removeVehicle(message.id)
  else if (message.type === 'fleet:set-destination') await simulation.setDestination(message)
  else return
  broadcast()
}

export function createFleetCommandProcessor(simulation, broadcast) {
  let commandQueue = Promise.resolve()

  return (socket, raw) => {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch { /* Ignore malformed client messages in this small demo. */
      return commandQueue
    }
    commandQueue = commandQueue
      .then(() => handleCommand(simulation, broadcast, message))
      .catch((error) => sendError(socket, error))
    return commandQueue
  }
}
