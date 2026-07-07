import * as os from 'os'
import { randomBytes } from 'crypto'
import { Notice, Platform, Setting } from 'obsidian'
import type OmnisearchPlugin from '../main'
import type { OmnisearchSettings } from './utils'
import { htmlDescription, saveSettings } from './utils'

function generateApiKey(): string {
  return randomBytes(32).toString('hex')
}

function getLanIpAddress(): string {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address
      }
    }
  }
  return '127.0.0.1'
}

function getAiToolServerUrl(settings: OmnisearchSettings): string {
  const host =
    settings.aiToolHost === '0.0.0.0'
      ? getLanIpAddress()
      : settings.aiToolHost
  return `http://${host}:${settings.aiToolPort}`
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()
  const copied = document.execCommand('copy')
  textArea.remove()
  if (!copied) {
    throw new Error('Clipboard copy failed')
  }
}

async function copyWithNotice(value: string, label: string): Promise<void> {
  try {
    await copyToClipboard(value)
    new Notice(`Omnisearch - Copied ${label}`)
  } catch (error) {
    console.error(error)
    new Notice(`Omnisearch - Could not copy ${label}. See console for details.`)
  }
}

export function injectSettingsHttp(
  plugin: OmnisearchPlugin,
  settings: OmnisearchSettings,
  containerEl: HTMLElement,
  refreshDisplay: () => void = () => {}
) {
  if (!Platform.isMobile) {
    new Setting(containerEl)
      .setName('API Access Through HTTP')
      .setHeading()
      .setDesc(
        htmlDescription(
          `Omnisearch can be used through a simple HTTP server (<a href="https://publish.obsidian.md/omnisearch/Public+API+%26+URL+Scheme#HTTP+Server">more information</a>).`
        )
      )

    new Setting(containerEl)
      .setName('Enable the HTTP server')
      .addToggle(toggle =>
        toggle.setValue(settings.httpApiEnabled).onChange(async v => {
          settings.httpApiEnabled = v
          if (v) {
            plugin.apiHttpServer.listen(settings.httpApiPort)
          } else {
            plugin.apiHttpServer.close()
          }
          await saveSettings(plugin)
        })
      )

    new Setting(containerEl).setName('HTTP Port').addText(component => {
      component
        .setValue(settings.httpApiPort)
        .setPlaceholder('51361')
        .onChange(async v => {
          if (parseInt(v) > 65535) {
            v = settings.httpApiPort
            component.setValue(settings.httpApiPort)
          }
          settings.httpApiPort = v
          if (settings.httpApiEnabled) {
            plugin.apiHttpServer.close()
            plugin.apiHttpServer.listen(settings.httpApiPort)
          }
          await saveSettings(plugin)
        })
    })

    new Setting(containerEl)
      .setName('Show a notification when the server starts')
      .setDesc(
        'Will display a notification if the server is enabled, at Obsidian startup.'
      )
      .addToggle(toggle =>
        toggle.setValue(settings.httpApiNotice).onChange(async v => {
          settings.httpApiNotice = v
          await saveSettings(plugin)
        })
      )

    new Setting(containerEl)
      .setName('AI tool server')
      .setHeading()
      .setDesc(
        htmlDescription(`Expose Omnisearch as a protocol-neutral tool server for external AI clients.<br>
        The current endpoint is OpenAPI-compatible for Open WebUI, and can share the same host/port with future MCP endpoints.<br>
        Authentication is required for search requests.`)
      )

    new Setting(containerEl)
      .setName('Enable AI tool server')
      .addToggle(toggle =>
        toggle.setValue(settings.aiToolEnabled).onChange(async v => {
          settings.aiToolEnabled = v
          if (v && !settings.aiToolApiKey) {
            settings.aiToolApiKey = generateApiKey()
            new Notice('Omnisearch - Generated AI tool API key')
          }
          if (v) {
            plugin.aiToolServer?.listen(
              settings.aiToolPort,
              settings.aiToolHost
            )
          } else {
            plugin.aiToolServer?.close()
          }
          await saveSettings(plugin)
          refreshDisplay()
        })
      )

    new Setting(containerEl)
      .setName('AI tool host')
      .setDesc(
        'Use 127.0.0.1 for local-only access, or 0.0.0.0 to allow another machine on the network to connect.'
      )
      .addText(component =>
        component
          .setValue(settings.aiToolHost)
          .setPlaceholder('127.0.0.1')
          .onChange(async v => {
            settings.aiToolHost = v.trim() || '127.0.0.1'
            if (settings.aiToolEnabled) {
              plugin.aiToolServer?.listen(
                settings.aiToolPort,
                settings.aiToolHost
              )
            }
            await saveSettings(plugin)
          })
      )

    new Setting(containerEl).setName('AI tool port').addText(component =>
      component
        .setValue(settings.aiToolPort)
        .setPlaceholder('8001')
        .onChange(async v => {
          if (parseInt(v) > 65535) {
            v = settings.aiToolPort
            component.setValue(settings.aiToolPort)
          }
          settings.aiToolPort = v
          if (settings.aiToolEnabled) {
            plugin.aiToolServer?.listen(
              settings.aiToolPort,
              settings.aiToolHost
            )
          }
          await saveSettings(plugin)
        })
    )

    new Setting(containerEl)
      .setName('AI tool server URL')
      .setDesc(getAiToolServerUrl(settings))
      .addButton(button =>
        button.setButtonText('Copy URL').onClick(async () => {
          await copyWithNotice(getAiToolServerUrl(settings), 'AI tool server URL')
        })
      )

    new Setting(containerEl)
      .setName('AI tool OpenAPI URL')
      .setDesc(`${getAiToolServerUrl(settings)}/openapi.json`)
      .addButton(button =>
        button.setButtonText('Copy OpenAPI URL').onClick(async () => {
          await copyWithNotice(
            `${getAiToolServerUrl(settings)}/openapi.json`,
            'AI tool OpenAPI URL'
          )
        })
      )

    new Setting(containerEl)
      .setName('AI tool API key')
      .setDesc(
        settings.aiToolApiKey
          ? settings.aiToolApiKey
          : 'Enable the server or generate a key.'
      )
      .addButton(button =>
        button.setButtonText('Copy key').onClick(async () => {
          if (!settings.aiToolApiKey) {
            settings.aiToolApiKey = generateApiKey()
            await saveSettings(plugin)
            refreshDisplay()
          }
          await copyWithNotice(settings.aiToolApiKey, 'AI tool API key')
        })
      )
      .addButton(button =>
        button.setButtonText('Regenerate').onClick(async () => {
          settings.aiToolApiKey = generateApiKey()
          await saveSettings(plugin)
          new Notice('Omnisearch - Regenerated AI tool API key')
          refreshDisplay()
        })
      )
  }
}
