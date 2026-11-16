// ОДНОРАЗОВАЯ настройка автовыкладки YouTube. Запускается на своём ПК, не в Actions.
// 1. console.cloud.google.com → создай проект → APIs & Services → Library → включи «YouTube Data API v3»
// 2. OAuth consent screen → External → заполни имя/почту → Save (Test-режим достаточен)
// 3. Credentials → Create Credentials → OAuth client ID → тип «Desktop app» → скопируй Client ID и Client secret
// 4. Запусти: node oauth-setup.mjs <CLIENT_ID> <CLIENT_SECRET>
//    Откроется браузер → войди в аккаунт КАНАЛА → разреши доступ → здесь появится refresh_token.
// 5. Положи в секреты репо: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
// Refresh-токен живёт годами и отзывается в Google Account → Security → Third-party access.
import http from 'node:http'
import { exec } from 'node:child_process'

const [, , CLIENT_ID, CLIENT_SECRET] = process.argv
if (!CLIENT_ID || !CLIENT_SECRET) { console.log('Использование: node oauth-setup.mjs <CLIENT_ID> <CLIENT_SECRET>'); process.exit(1) }
const PORT = 8085
const REDIRECT = `http://localhost:${PORT}`
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload'
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent`

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT)
  if (!u.searchParams.get('code')) { res.end('Жду код авторизации...'); return }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: u.searchParams.get('code'), grant_type: 'authorization_code', redirect_uri: REDIRECT }),
  })
  const d = await r.json()
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(d.refresh_token ? '<h2>Готово! Refresh token ниже — скопируй его.</h2><pre style="font-size:20px">YT_REFRESH_TOKEN</pre>'.replace('YT_REFRESH_TOKEN', d.refresh_token) : `<h2>Ошибка</h2><pre>${JSON.stringify(d, null, 1)}</pre>`)
  console.log('\n=== СЕКРЕТЫ ДЛЯ РЕПО ===')
  console.log('YT_CLIENT_ID =', CLIENT_ID)
  console.log('YT_CLIENT_SECRET =', CLIENT_SECRET)
  console.log('YT_REFRESH_TOKEN =', d.refresh_token || '(не получен — см. страницу браузера)')
  server.close()
  process.exit(0)
})

server.listen(PORT, async () => {
  console.log(`Открываю браузер для входа в аккаунт канала... (если не открылся — перейди сам:\n${authUrl})`)
  exec(`start "" "${authUrl}"`)
})
