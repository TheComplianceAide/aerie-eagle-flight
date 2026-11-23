(() => {
  'use strict';

  const format = 'video/mp4; codecs="avc1.64001f"';
  const segmentCount = 61;
  const bufferAheadSeconds = 4;
  const fallbackDelayMs = 6000;

  function createHeroVideo(video) {
    const Media = [window.MediaSource, window.ManagedMediaSource]
      .find(type => type?.isTypeSupported(format));
    let active = false;
    let source;
    let buffer;
    let objectUrl;
    let nextSegment = 0;
    let fetching = false;
    let fallbackTimer;
    const requests = new AbortController();

    function play() {
      video.play().catch(() => {});
    }

    function useOriginal() {
      if (video.getAttribute('src') === video.dataset.src) return;
      const resumeAt = video.currentTime;
      clearTimeout(fallbackTimer);
      requests.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      source = null;
      if (resumeAt > 0) video.addEventListener('loadedmetadata', () => {
        video.currentTime = Math.min(resumeAt, video.duration);
      }, { once: true });
      video.src = video.dataset.src;
      if (active) play();
    }

    function watchForStall() {
      if (!source || !active || fallbackTimer) return;
      fallbackTimer = setTimeout(() => {
        fallbackTimer = undefined;
        if (active && source) useOriginal();
      }, fallbackDelayMs);
    }

    async function fillBuffer() {
      if (!active || fetching || !buffer || buffer.updating || source?.readyState !== 'open') return;
      if (nextSegment === segmentCount) {
        source.endOfStream();
        return;
      }
      const ranges = buffer.buffered;
      for (let i = 0; i < ranges.length; i++) {
        if (ranges.start(i) <= video.currentTime && ranges.end(i) - video.currentTime > bufferAheadSeconds) return;
      }

      fetching = true;
      try {
        const response = await fetch(video.dataset.segments + nextSegment + '.mp4', { signal: requests.signal });
        if (!response.ok) throw new Error('Background video segment could not be loaded.');
        const bytes = await response.arrayBuffer();
        if (!source) return;
        buffer.appendBuffer(bytes);
        nextSegment++;
      } catch {
        if (source) useOriginal();
      } finally {
        fetching = false;
      }
    }

    function startSegments() {
      try {
        source = new Media();
        source.addEventListener('sourceopen', () => {
          if (!source) return;
          try {
            buffer = source.addSourceBuffer(format);
            // Match the original timeline after the stream-copy muxer shifted the decode timestamps.
            buffer.timestampOffset = -2 / 24;
            buffer.addEventListener('updateend', fillBuffer);
            buffer.addEventListener('error', useOriginal);
            fillBuffer();
          } catch {
            useOriginal();
          }
        }, { once: true });
        video.disableRemotePlayback = true;
        objectUrl = URL.createObjectURL(source);
        video.src = objectUrl;
        watchForStall();
      } catch {
        useOriginal();
      }
    }

    video.addEventListener('timeupdate', fillBuffer);
    video.addEventListener('waiting', watchForStall);
    video.addEventListener('playing', () => {
      clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    });
    video.addEventListener('error', () => {
      if (source) useOriginal();
    });

    return function setPlaying(shouldPlay) {
      if (active === shouldPlay) return;
      active = shouldPlay;
      if (!active) {
        clearTimeout(fallbackTimer);
        fallbackTimer = undefined;
        video.pause();
        return;
      }
      if (!video.getAttribute('src')) {
        if (Media && video.dataset.segments) startSegments();
        else return useOriginal();
      }
      if (source && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) watchForStall();
      play();
      fillBuffer();
    };
  }

  window.setAerieHeroPlaying = createHeroVideo(document.getElementById('mount-major-flight'));
})();
