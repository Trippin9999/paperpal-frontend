import { createRouter, createWebHistory } from 'vue-router'
import PdfManageView from '@/views/PdfManageView.vue'
import ReaderView from '@/views/ReaderView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'pdf-manage',
      component: PdfManageView,
    },
    {
      path: '/read/:documentId',
      name: 'reader',
      component: ReaderView,
    },
  ],
})

export default router
