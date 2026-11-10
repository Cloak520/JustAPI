import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { registerRequestBuilderBuiltins } from '@/features/request-builder/registerBuiltins'
import { registerResponseViewerBuiltins } from '@/features/response-viewer/registerBuiltins'
import App from './App.vue'
import './assets/main.css'

registerRequestBuilderBuiltins()
registerResponseViewerBuiltins()

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
