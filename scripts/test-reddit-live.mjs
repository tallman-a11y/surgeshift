const key = 'BSAoojiA5KCSnOhxO9P58TIhCnDkctD'

const keywords = [
  'CWI exam prep',
  'CWI study guide',
  'certified welding inspector',
  'welding certification app',
  'AWS CWI'
]

console.log('Testing Brave Search for WeldShift keywords...\n')

let totalPosts = 0

for (const kw of keywords) {
  const query = `site:reddit.com ${kw}`
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
    { headers: { 'Accept': 'application/json', 'X-Subscription-Token': key } }
  )
  const d = await res.json()
  if (d.type === 'ErrorResponse') { console.log('API ERROR:', JSON.stringify(d)); break }

  const all = d.web?.results ?? []
  const posts = all.filter(i => i.url.includes('/comments/'))
  totalPosts += posts.length

  console.log(`"${kw}": ${all.length} results, ${posts.length} with /comments/`)
  posts.slice(0, 2).forEach(p => console.log(`  - ${p.url.slice(0,80)}`))
  await new Promise(r => setTimeout(r, 300))
}

console.log(`\nTotal post URLs found: ${totalPosts}`)
