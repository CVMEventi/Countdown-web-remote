import './index.css'
import {createApp} from 'vue'
import {createRouter, createWebHashHistory} from 'vue-router'
import App from './App.vue'
import Pair from './pages/Pair.vue'
import Remote from './pages/Remote.vue'
import Display from './pages/Display.vue'

const router = createRouter({
  // Hash history keeps the pairing code out of anything the web server sees
  history: createWebHashHistory(),
  routes: [
    {path: '/', component: Pair},
    {path: '/r/:code', component: Remote, props: true},
    {path: '/d/:code/:timerId?/:windowId?', component: Display, props: true},
  ],
})

createApp(App).use(router).mount('#app')
