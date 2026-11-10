export interface KeyBinding {
  key: string // e.g. 's', 'Enter', 'f', '\\'
  mod?: boolean // Cmd on macOS / Ctrl on Windows/Linux
  shift?: boolean
  alt?: boolean
}

export interface CommandDefinition {
  id: string
  title: string
  category?: string
  hiddenInPalette?: boolean
  shortcut?: KeyBinding
  when?: () => boolean
  run: () => unknown | Promise<unknown>
}

/**
 * 统一命令与全局快捷键注册表：告别分散在多个组件里的 onKeyStroke
 */
export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>()

  register(def: CommandDefinition): () => void {
    this.commands.set(def.id, def)
    return () => this.unregister(def.id)
  }

  unregister(id: string): void {
    this.commands.delete(id)
  }

  get(id: string): CommandDefinition | undefined {
    return this.commands.get(id)
  }

  list(): CommandDefinition[] {
    return Array.from(this.commands.values())
  }

  async execute(id: string): Promise<boolean> {
    const cmd = this.commands.get(id)
    if (!cmd) return false
    if (cmd.when && !cmd.when()) return false
    await cmd.run()
    return true
  }

  matchKeyEvent(e: KeyboardEvent): CommandDefinition | null {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) {
      return null
    }
    const eventKey = e.key.toLowerCase()
    const eventCode = (e.code || '').toLowerCase()
    const hasMod = e.metaKey || e.ctrlKey

    for (const cmd of this.commands.values()) {
      const sc = cmd.shortcut
      if (!sc) continue
      const targetKey = sc.key.toLowerCase()
      const keyMatched =
        eventKey === targetKey ||
        (Boolean(sc.alt) && /^[a-z]$/.test(targetKey) && eventCode === `key${targetKey}`)
      if (!keyMatched) continue
      if (Boolean(sc.mod) !== hasMod) continue
      if (Boolean(sc.shift) !== e.shiftKey) continue
      if (Boolean(sc.alt) !== e.altKey) continue
      if (cmd.when && !cmd.when()) continue
      return cmd
    }
    return null
  }

  async handleKeyDown(e: KeyboardEvent): Promise<boolean> {
    const cmd = this.matchKeyEvent(e)
    if (!cmd) return false
    e.preventDefault()
    await cmd.run()
    return true
  }
}

export const defaultCommandRegistry = new CommandRegistry()
