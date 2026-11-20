import { ZapretManager } from './zapret/manager'
import { TgwsManager } from './tgws/manager'
import { Tester } from './zapret/tester'
import { UpdateChecker } from './updates'

export const zapret = new ZapretManager()
export const tgws = new TgwsManager()
export const tester = new Tester(zapret)
export const updates = new UpdateChecker(zapret, tgws)
