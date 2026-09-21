import { forwardRef } from 'react'

import { VideoPlayer } from './VideoPlayer'

export const VideoMonitor = forwardRef<HTMLVideoElement, { mediaUrl: string; title: string }>(
  ({ mediaUrl, title }, ref) => <div className="video-monitor">
    <VideoPlayer ref={ref} src={mediaUrl} title={title} />
  </div>,
)

VideoMonitor.displayName = 'VideoMonitor'
