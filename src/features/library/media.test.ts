import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { exerciseImageAlt, exerciseImageUrls, exerciseVideoUrl, exerciseYoutubeId } from './media.ts'

describe('exercise media', () => {
  it('keeps only local exercise images', () => {
    assert.deepEqual(
      exerciseImageUrls({
        imageUrls: ['/exercise-images/ex-bsquat-0.webp', 'https://example.com/a.jpg', '', 12 as unknown as string],
      }),
      ['/exercise-images/ex-bsquat-0.webp'],
    )
    assert.deepEqual(exerciseImageUrls(null), [])
  })

  it('accepts https watch links and 11-character YouTube ids', () => {
    assert.equal(exerciseVideoUrl({ videoUrl: 'https://www.youtube.com/watch?v=ultWZbUMPL8' }), 'https://www.youtube.com/watch?v=ultWZbUMPL8')
    assert.equal(exerciseVideoUrl({ videoUrl: 'http://example.com/v' }), null)
    assert.equal(exerciseYoutubeId({ youtubeId: 'ultWZbUMPL8' }), 'ultWZbUMPL8')
    assert.equal(exerciseYoutubeId({ youtubeId: 'too-short' }), null)
    assert.equal(exerciseYoutubeId({ youtubeId: 'has space!!' }), null)
  })

  it('labels the start and end frames', () => {
    assert.equal(exerciseImageAlt('Back Squat', 0), 'Back Squat: start position')
    assert.equal(exerciseImageAlt('Back Squat', 1), 'Back Squat: end position')
    assert.equal(exerciseImageAlt('Back Squat', 2), 'Back Squat: image 3')
  })
})
