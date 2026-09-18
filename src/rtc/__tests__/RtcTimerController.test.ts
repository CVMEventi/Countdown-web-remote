import {describe, expect, it, vi} from 'vitest'
import {RtcTimerController} from '../RtcTimerController.ts'
import type {RtcSession} from '../RtcSession.ts'

function makeController() {
  const command = vi.fn(async () => {})
  const session = {command} as unknown as RtcSession
  return {controller: new RtcTimerController(session), command}
}

describe('RtcTimerController', () => {
  it('maps set', async () => {
    const {controller, command} = makeController()
    await controller.set('timer1', 90)
    expect(command).toHaveBeenCalledWith({verb: 'set', timerId: 'timer1', seconds: 90})
  })

  it('maps start', async () => {
    const {controller, command} = makeController()
    await controller.start('timer1')
    expect(command).toHaveBeenCalledWith({verb: 'start', timerId: 'timer1'})
  })

  it('maps reset', async () => {
    const {controller, command} = makeController()
    await controller.reset('timer1')
    expect(command).toHaveBeenCalledWith({verb: 'reset', timerId: 'timer1'})
  })

  it('maps toggle', async () => {
    const {controller, command} = makeController()
    await controller.toggle('timer1')
    expect(command).toHaveBeenCalledWith({verb: 'toggle', timerId: 'timer1'})
  })

  it('maps jogSet', async () => {
    const {controller, command} = makeController()
    await controller.jogSet('timer1', -60)
    expect(command).toHaveBeenCalledWith({verb: 'jogSet', timerId: 'timer1', seconds: -60})
  })

  it('maps jogCurrent', async () => {
    const {controller, command} = makeController()
    await controller.jogCurrent('timer1', 300)
    expect(command).toHaveBeenCalledWith({verb: 'jogCurrent', timerId: 'timer1', seconds: 300})
  })

  it('maps stopSound', async () => {
    const {controller, command} = makeController()
    await controller.stopSound('timer1')
    expect(command).toHaveBeenCalledWith({verb: 'stopSound', timerId: 'timer1'})
  })

  // The operator typed prose, so this is the one verb worth waiting on
  it('asks for an ack only on sendMessage', async () => {
    const {controller, command} = makeController()

    await controller.sendMessage('timer1', 'stand by')
    expect(command).toHaveBeenCalledWith(
      {verb: 'sendMessage', timerId: 'timer1', message: 'stand by'},
      {awaitAck: true}
    )

    command.mockClear()
    await controller.start('timer1')
    expect(command).toHaveBeenCalledWith(expect.anything())
    expect(command.mock.calls[0]).toHaveLength(1)
  })

  it('passes an empty message through, which is how a message is cleared', async () => {
    const {controller, command} = makeController()
    await controller.sendMessage('timer1', '')
    expect(command).toHaveBeenCalledWith(
      {verb: 'sendMessage', timerId: 'timer1', message: ''},
      {awaitAck: true}
    )
  })
})
