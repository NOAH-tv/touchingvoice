import { analyzePcm } from './file-analysis-core.js';

// Cancellation is Worker.terminate(): no queued job can keep computing after
// the owning file/member changes. Every message carries its request identity.
self.onmessage = ({ data }) => {
  if (data?.type !== 'analyze') return;
  const { id, pcm, sampleRate, profile, profileId } = data;
  try {
    const result = analyzePcm({ pcm, sampleRate, profile, profileId,
      onProgress: progress => self.postMessage({ type: 'progress', id, progress }) });
    self.postMessage({ type: 'result', id, result }, [result.dataset.values.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error?.message || '파일 전체 분석을 완료하지 못했습니다.' });
  }
};
