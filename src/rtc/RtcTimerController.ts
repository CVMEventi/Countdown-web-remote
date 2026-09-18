import type {ITimerController} from '../protocol/TimerController.ts'
import type {RtcSession} from './RtcSession.ts'

export class RtcTimerController implements ITimerController {
  constructor(private session: RtcSession) {}

  async set(timerId: string, seconds: number) {
    await this.session.command({verb: 'set', timerId, seconds})
  }

  async start(timerId: string) {
    await this.session.command({verb: 'start', timerId})
  }

  async reset(timerId: string) {
    await this.session.command({verb: 'reset', timerId})
  }

  async toggle(timerId: string) {
    await this.session.command({verb: 'toggle', timerId})
  }

  async jogSet(timerId: string, seconds: number) {
    await this.session.command({verb: 'jogSet', timerId, seconds})
  }

  async jogCurrent(timerId: string, seconds: number) {
    await this.session.command({verb: 'jogCurrent', timerId, seconds})
  }

  // The only verb worth a round trip: the operator typed prose and wants to know it landed
  async sendMessage(timerId: string, message: string) {
    await this.session.command({verb: 'sendMessage', timerId, message}, {awaitAck: true})
  }

  async stopSound(timerId: string) {
    await this.session.command({verb: 'stopSound', timerId})
  }
}
