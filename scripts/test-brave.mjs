const key = 'BSAoojiA5KCSnOhxO9P58TIhCnDkctD'

const queries = [
  'site:reddit.com CWI exam prep',
  'site:reddit.com welding certification questions',
  'reddit.com welding inspector exam study',
  'site:reddit.com AWS D1.1 help',
]

for (const q of queries) {
  // no freshness filter this time
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`,
    { headers: { 'Accept': 'application/json', 'X-Subscription-Token': key } }
  )
  const d = await res.json()
  const items = d.web?.results ?? []
  const posts = items.filter(i => i.url.includes('/comments/'))
  console.log(`\nQ: ${q}`)
  console.log(`  total: ${items.length} | reddit posts: ${posts.length}`)
  posts.slice(0, 3).forEach(i => {
    console.log(`  - ${i.url.slice(0, 80)}`)
    console.log(`    "${i.description?.slice(0, 80)}"`)
  })
  await new Promise(r => setTimeout(r, 500))
}
