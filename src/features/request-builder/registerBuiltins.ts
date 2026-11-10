import { bodyEditorRegistry, requestTabRegistry } from '@/core/registries/extensionRegistry'
import BodyPanel from './components/BodyPanel.vue'
import HeadersPanel from './components/HeadersPanel.vue'
import ParamsPanel from './components/ParamsPanel.vue'
import FormBodyEditor from './components/body/FormBodyEditor.vue'
import JsonBodyEditor from './components/body/JsonBodyEditor.vue'
import NoneBodyEditor from './components/body/NoneBodyEditor.vue'
import RawBodyEditor from './components/body/RawBodyEditor.vue'

let registered = false

export function registerRequestBuilderBuiltins() {
  if (registered) return
  registered = true

  requestTabRegistry.register({
    id: 'headers',
    order: 10,
    label: 'Headers',
    component: HeadersPanel,
    badgeCount: ({ activeHeadersCount }) => activeHeadersCount
  })

  requestTabRegistry.register({
    id: 'params',
    order: 20,
    label: 'Params',
    component: ParamsPanel,
    badgeCount: ({ request }) =>
      request.queryParams.filter(p => p.enabled && p.key.trim()).length +
      request.pathParams.length
  })

  requestTabRegistry.register({
    id: 'body',
    order: 30,
    label: 'Body',
    component: BodyPanel,
    badgeCount: ({ request }) => (request.bodyType !== 'none' ? 1 : 0)
  })

  bodyEditorRegistry.register({ id: 'none', order: 10, label: 'none', component: NoneBodyEditor })
  bodyEditorRegistry.register({ id: 'json', order: 20, label: 'JSON', component: JsonBodyEditor })
  bodyEditorRegistry.register({
    id: 'form-data',
    order: 30,
    label: 'form-data',
    component: FormBodyEditor
  })
  bodyEditorRegistry.register({
    id: 'x-www-form-urlencoded',
    order: 40,
    label: 'x-www-form-urlencoded',
    component: FormBodyEditor
  })
  bodyEditorRegistry.register({ id: 'raw', order: 50, label: 'Raw Text', component: RawBodyEditor })
}

