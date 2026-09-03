#!/usr/bin/env node
/**
 * Parking-lot bridge.
 *
 * The Shift parking lot is a shared cross-product timeline of what every agent (human
 * or otherwise) has done, so work can be picked up where someone else left off. The
 * helper itself lives outside this repo, at ~/.claude/shift-parking-lot/shiftlog.mjs,
 * and is not guaranteed to be installed on any given machine.
 *
 * So this is a bridge, not a reimplementation: it forwards to the real helper when
 * present, and when it is absent it says so and exits 0. That last part matters —
 * this runs from a git hook, and a missing optional tool must never block a commit.
 *
 *   node scripts/shiftlog.mjs catchup
 *   node scripts/shiftlog.mjs log "<what happened>"
 *   node scripts/shiftlog.mjs resolve <thread>
 *   node scripts/shiftlog.mjs handoff "<resume point>"
 *
 * Every entry is tagged with this product, so `catchup agentshift` finds them.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PRODUCT = 'agentshift'

const HELPER = process.env.SHIFT_PARKING_LOT
  ?? join(homedir(), '.claude', 'shift-parking-lot', 'shiftlog.mjs')

const [command, ...rest] = process.argv.slice(2)

if (!command) {
  console.error('usage: shiftlog.mjs <catchup|log|resolve|handoff> [args]')
  process.exit(2)
}

if (!existsSync(HELPER)) {
  // Absent is a normal state, not a failure: the parking lot is a shared tool that
  // may simply not be installed here. Exit 0 so hooks and CI carry on.
  console.log(
    `[shiftlog] parking-lot helper not found at ${HELPER} — skipping "${command}".\n` +
    '[shiftlog] Install it, or set SHIFT_PARKING_LOT to its path, to join the shared timeline.',
  )
  process.exit(0)
}

// `handoff` is spelled `log` upstream with a resume_point marker; keep the friendlier
// verb locally and translate on the way out.
const argv = command === 'handoff'
  ? ['log', '--product', PRODUCT, '--type', 'resume_point', ...rest]
  : [command, '--product', PRODUCT, ...rest]

const result = spawnSync(process.execPath, [HELPER, ...argv], { stdio: 'inherit' })

if (result.error) {
  console.log(`[shiftlog] could not run the helper: ${result.error.message} — skipping.`)
  process.exit(0)
}

process.exit(result.status ?? 0)
