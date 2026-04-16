import { createRouter, createWebHistory } from 'vue-router'
import PdfManageView from '@/views/PdfManageView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'pdf-manage',
      component: PdfManageView,
    },
  ],
})

export default router
