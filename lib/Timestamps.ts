// Always UTC, e.g. "2026-10-08T09:30:00.000Z".
export function currentTime() {
  return new Date().toISOString()
}

// For something new: created and last updated now.
export function newTimestamps() {
  const time = currentTime()
  return { createdAt: time, updatedAt: time }
}
