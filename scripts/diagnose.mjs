// Quick diagnostic: test each scanner component directly
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env.local manually
const __dir = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(join(__dir, '../.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const REDDIT_UA = 'SurgeShift/1.0 (contact@allshiftai.com)'
const KEYWORDS = ['CWI exam prep', 'welding certification', 'AWS D1.1']
const SUBREDDITS = ['welding', 'metalworking']

async function testRedditRSS() {
  console.log('\n=== REDDIT RSS ===')
  for (const keyword of KEYWORDS.slice(0, 2)) {
    const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(keyword)}&sort=new&t=week&limit=10`
    console.log(`Fetching: ${url}`)
    try {
      const res = await fetch(url, { headers: { 'User-Agent': REDDIT_UA } })
      const body = await res.text()
      console.log(`  Status: ${res.status}`)
      console.log(`  Content-Type: ${res.headers.get('content-type')}`)
      const entryCount = (body.match(/<entry>/g) ?? []).length
      console.log(`  Entries in feed: ${entryCount}`)
      if (entryCount === 0) {
        console.log(`  Body preview: ${body.slice(0, 300)}`)
      } else {
        // Extract first title
        const firstTitle = body.match(/<title[^>]*>([\s\S]*?)<\/title>/g)?.[1]
        console.log(`  First entry title tag: ${firstTitle?.slice(0, 100)}`)
        // Check updated field
        const firstUpdated = body.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]
        console.log(`  First updated: ${firstUpdated}`)
      }
    } catch (e) {
      console.log(`  ERROR: ${e}`)
    }
  }

  // Also test subreddit search
  console.log('\n--- Subreddit search ---')
  const url = `https://www.reddit.com/r/welding/search.rss?q=exam&sort=new&t=week&limit=5&restrict_sr=true`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': REDDIT_UA } })
    const body = await res.text()
    console.log(`/r/welding search status: ${res.status}`)
    const entryCount = (body.match(/<entry>/g) ?? []).length
    console.log(`Entries: ${entryCount}`)
    if (entryCount === 0) console.log(`Body preview: ${body.slice(0, 300)}`)
  } catch (e) {
    console.log(`ERROR: ${e}`)
  }
}

async function testYouTube() {
  console.log('\n=== YOUTUBE ===')
  const key = process.env.YOUTUBE_API_KEY
  if (!key) { console.log('  YOUTUBE_API_KEY not in .env.local — skipping'); return }
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent('CWI exam prep')}&type=video&order=date&maxResults=5&relevanceLanguage=en&key=${key}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    console.log(`  Status: ${res.status}`)
    if (data.error) { console.log(`  API Error: ${JSON.stringify(data.error)}`); return }
    console.log(`  Videos returned: ${data.items?.length ?? 0}`)
    data.items?.slice(0, 3).forEach(i => console.log(`  - ${i.snippet?.title?.slice(0, 70)}`))
  } catch (e) {
    console.log(`  ERROR: ${e}`)
  }
}

async function testTwitter() {
  console.log('\n=== TWITTER ===')
  const token = process.env.TWITTER_BEARER_TOKEN
  if (!token) { console.log('  TWITTER_BEARER_TOKEN not in .env.local — skipping'); return }
  const query = encodeURIComponent('"CWI exam" -is:retweet lang:en')
  const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=10`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    console.log(`  Status: ${res.status}`)
    if (data.errors) { console.log(`  API Errors: ${JSON.stringify(data.errors)}`); return }
    if (data.error) { console.log(`  Error: ${JSON.stringify(data.error)}`); return }
    console.log(`  Tweets returned: ${data.data?.length ?? 0} (meta: ${JSON.stringify(data.meta)})`)
  } catch (e) {
    console.log(`  ERROR: ${e}`)
  }
}

await testRedditRSS()
await testYouTube()
await testTwitter()
console.log('\nDone.')
