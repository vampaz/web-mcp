self.addEventListener('activate', function activate(event) {
  event.waitUntil(self.clients.claim())
})
