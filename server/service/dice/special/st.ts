import { BasePtDiceRoll } from '../index'
import { DiceRoll } from '@dice-roller/rpg-dice-roller'
import { IDiceRollContext, parseTemplate } from '../utils'
import type { ICard } from '../../../../interface/card/types'
import { DndCard } from '../../../../interface/card/dnd'

const AtUserPattern = /^<@!(\d+)>/ // todo 后续配置注入

// .st [@xx] xx +1d6，yy -2，zz 20  // 根据逗号或分号分隔。不支持自动探测，因为骰子表达式情况比较复杂，难以判断。而且也要考虑技能名特殊字符的情况
// .st show [@xx] xx,xx,xx
export class StDiceRoll extends BasePtDiceRoll {

  private show = false
  private targetUserId = ''
  private exp = ''
  private targetUserCard?: ICard
  private readonly rolls: { name: string, roll: DiceRoll }[] = []
  private readonly shows: string[] = []

  override roll() {
    this.exp = this.rawExpression.slice(2).trim()
    // if is show mode
    if (this.exp.startsWith('show')) {
      this.show = true
      this.exp = this.exp.slice(4).trim()
    }
    // if set user
    const userIdMatch = this.exp.match(AtUserPattern)
    if (userIdMatch) {
      this.targetUserId = userIdMatch[1]
      this.exp = this.exp.slice(userIdMatch[0].length).trim()
    } else {
      this.targetUserId = this.context.userId
    }
    // 是否有人物卡，如没有直接结束
    this.targetUserCard = this.context.getCard(this.targetUserId)
    if (!this.targetUserCard) return this
    if (this.show) {
      this.rollShow()
    } else if (this.hasEditPermission) {
      this.rollSet()
    }
    return this
  }

  private get hasEditPermission() {
    const control = this.context.config.specialDice.stDice.writable
    const userRole = this.context.userRole
    if (control === 'none') {
      return false
    } else if (control === 'all') {
      return true
    } else { // manager
      return userRole !== 'user'
    }
  }

  private rollSet() {
    const segments = this.exp.split(/[,，;；]+/).filter(segment => !!segment.trim())
    // 解析表达式，注意要指定 targetUserId 的人物卡
    const context: IDiceRollContext = { ...this.context, userId: this.targetUserId, username: this.targetUserId }
    segments.forEach(segment => {
      // 根据空格、+、—、数字来分隔，满足大多数的情况
      const index = segment.search(/[\s+\-\d]/)
      if (index < 0) return
      let name = segment.slice(0, index).trim()
      const value = segment.slice(index).trim()
      if (!name || !value) return
      // 根据 value 拼装表达式
      // dnd 特殊处理，如果 st 的是技能，则重定向到技能修正值，以提供更符合直觉的体验
      if (this.targetUserCard instanceof DndCard) {
        const entry = this.targetUserCard.getEntry(name)
        if (entry && entry.type === 'skills' && entry.postfix === 'none') {
          name = `${name}修正`
        }
      }
      // dnd 特殊处理 end
      const baseValue = `\${${name}}`
      const expression = value.startsWith('+') || value.startsWith('-') ? `${baseValue}${value}` : value
      const parsed = parseTemplate(expression, context, this.inlineRolls)
      this.rolls.push({ name, roll: new DiceRoll(parsed) })
    })
  }

  private rollShow() {
    const segments = this.exp.split(/[,，;；]+/).filter(segment => !!segment.trim())
    if (segments.length > 0) {
      this.shows.push(...segments.map(name => this.targetUserCard!.getEntryDisplay(name)))
    } else {
      // 不指定展示哪个，就默认展示全部
      this.shows.push('\n' + this.targetUserCard!.getSummary())
    }
  }

  override get output() {
    if (!this.targetUserCard) {
      return `${at(this.targetUserId)}没有关联人物卡`
    }
    const cardName = this.targetUserCard.data.name
    if (this.show) {
      // 展示
      const list = this.shows.join(' ')
      return `${at(this.targetUserId)}(${cardName}):${this.shows.length > 1 ? '\n' : ' '}${list}`
    } else {
      // 设置
      // 权限判断
      if (!this.hasEditPermission) {
        return `${this.context.username} 没有修改人物卡的权限`
      }
      // 如果只设置一个属性，就显示详细信息，否则就简略吧
      if (this.rolls.length === 0) {
        return `${at(this.context.userId)}请指定想要设置的属性名与属性值`
      } else if (this.rolls.length === 1) {
        const entry = this.rolls[0]
        return `${at(this.targetUserId)}(${cardName}) 设置 ${entry.name} ${entry.roll.output}`
      } else {
        const list = this.rolls.map(item => `${item.name}=${item.roll.total}`).join(' ')
        return `${at(this.targetUserId)}(${cardName}) 设置:\n${list}`
      }
    }
  }

  override applyToCard() {
    if (this.show) return []
    if (!this.targetUserCard) return []
    if (this.rolls.length === 0) return []
    let modified = false
    this.rolls.forEach(item => {
      // const entry = this.targetUserCard!.getEntry(item.name)
      // const skillName = entry?.name || item.name
      const b = this.targetUserCard!.setEntry(item.name, item.roll.total)
      modified ||= b
    })
    return modified ? [this.targetUserCard] : []
  }
}

function at(userId: string) {
  return `<@!${userId}>`
}
