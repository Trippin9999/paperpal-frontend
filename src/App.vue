<script setup>
import { ref, onMounted } from 'vue'

const message = ref('正在等待後端回應...')

onMounted(() => {
  // 這裡就是去呼叫我們剛寫好的 Spring Boot API
  fetch('http://localhost:8080/api/test')
    .then(response => response.text())
    .then(data => {
      console.log("從後端拿到的資料：", data)
      message.value = data // 更新變數，畫面就會跟著變
    })
    .catch(error => {
      console.error("連線失敗：", error)
      message.value = '連線失敗，請確認後端有沒有開！'
    })
})
</script>

<template>
  <h1>You did it!</h1>
  <p>
    Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> to read the
    documentation
  </p>
  <div style="padding: 20px; text-align: center;">
    <h1>PaperPal 前後端串接測試</h1>
    <h2 style="color: blue;">{{ message }}</h2>
  </div>
</template>

<style scoped></style>
