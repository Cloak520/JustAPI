import { responseTabRegistry } from '@/core/registries/extensionRegistry'
import ResponseBodyTab from './components/ResponseBodyTab.vue'
import ResponseCookiesTab from './components/ResponseCookiesTab.vue'
import ResponseHeadersTab from './components/ResponseHeadersTab.vue'
import { getContentTypeBadgeClass, getContentTypeTag } from './composables/useResponseViewState'

let registered = false

export function registerResponseViewerBuiltins() {
  if (registered) return
  registered = true

  responseTabRegistry.register({
    id: 'body',
    order: 10,
    label: 'Body',
    component: ResponseBodyTab,
    badgeText: res => getContentTypeTag(res) || undefined,
    badgeClass: res => getContentTypeBadgeClass(res)
  })

  responseTabRegistry.register({
    id: 'headers',
    order: 20,
    label: 'Headers',
    component: ResponseHeadersTab,
    badgeCount: res => (res?.headers ? Object.keys(res.headers).length : 0)
  })

  responseTabRegistry.register({
    id: 'cookies',
    order: 30,
    label: 'Cookies',
    component: ResponseCookiesTab,
    badgeCount: res => (res?.cookies ? res.cookies.length : 0)
  })
}

