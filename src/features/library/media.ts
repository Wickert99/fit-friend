const IMAGE_PREFIX = '/exercise-images/'
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

export function exerciseImageUrls(exercise: { imageUrls?: string[] } | null | undefined): string[] {
  const urls = exercise?.imageUrls
  if (!Array.isArray(urls)) return []
  return urls.filter((url) => typeof url === 'string' && url.startsWith(IMAGE_PREFIX))
}

export function exerciseVideoUrl(exercise: { videoUrl?: string } | null | undefined): string | null {
  const url = exercise?.videoUrl
  if (typeof url !== 'string' || !/^https:\/\//i.test(url.trim())) return null
  return url.trim()
}

export function exerciseYoutubeId(exercise: { youtubeId?: string } | null | undefined): string | null {
  const id = exercise?.youtubeId
  return typeof id === 'string' && YOUTUBE_ID.test(id) ? id : null
}

export function exerciseImageAlt(name: string, index: number): string {
  if (index === 0) return `${name}: start position`
  if (index === 1) return `${name}: end position`
  return `${name}: image ${index + 1}`
}
